/**
 * FeedbackService — 反馈回传与持久化服务
 *
 * 负责将评分结果构造为 FeedbackRecord、持久化存储、
 * 以及通过 Waggle 消息总线将反馈回传给执行 Agent。
 */

import { createFeedbackRecord } from '../models/feedback.js'
import { FeedbackScorer } from './feedback-scorer.js'

export class FeedbackService {
  /** @type {FeedbackScorer} */
  #scorer

  /** @type {import('../utils/event-bus.js').EventBus | null} */
  #eventBus

  /** @type {import('../core/waggle.js').Waggle | null} */
  #waggle

  /** @type {import('../core/hive.js').Hive | null} */
  #hive

  /** @type {import('../storage/memory-store.js').MemoryStore | null} */
  #store

  /** @type {Object} */
  #logger

  /**
   * @param {{
   *   eventBus?: import('../utils/event-bus.js').EventBus,
   *   waggle?: import('../core/waggle.js').Waggle,
   *   hive?: import('../core/hive.js').Hive,
   *   store?: Object,
   *   logger?: Object
   * }} deps
   */
  constructor({ eventBus = null, waggle = null, hive = null, store = null, logger = console } = {}) {
    this.#scorer = new FeedbackScorer()
    this.#eventBus = eventBus
    this.#waggle = waggle
    this.#hive = hive
    this.#store = store
    this.#logger = logger
  }

  /** @returns {FeedbackScorer} */
  get scorer() {
    return this.#scorer
  }

  /**
   * 任务完成后自动生成评分并存储
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {Object} [executionMeta]
   * @param {boolean} [executionMeta.usedFallback]
   * @param {number} [executionMeta.timeoutMs]
   * @returns {import('../models/feedback.js').FeedbackRecord | null}
   */
  autoScore(task, executionMeta = {}) {
    if (!task || !task.taskId) {
      this.#logger.warn({ task }, 'autoScore called with invalid task')
      return null
    }

    const autoScoreValue = this.#scorer.compute(task, executionMeta)

    // 获取主 Agent ID（第一个结果的 agentId）
    const primaryAgentId = task.results?.[0]?.agentId ?? 'unknown'
    const primaryCapability = task.steps?.[0]?.capability ?? ''

    const feedback = createFeedbackRecord({
      taskId: task.taskId,
      conversationId: task.conversationId,
      agentId: primaryAgentId,
      capability: primaryCapability,
      source: 'auto',
      autoScore: autoScoreValue,
      finalScore: autoScoreValue,
      taskContext: {
        strategy: task.strategy,
        stepCount: task.steps?.length ?? 0,
        status: task.status,
        totalRetries: (task.results ?? []).reduce((sum, r) => sum + (r.retryCount ?? 0), 0)
      }
    })

    // 持久化（异步，不阻塞）
    this.#persist(feedback)

    // 事件通知
    this.#eventBus?.emit('feedback.created', feedback)

    this.#logger.info({
      feedbackId: feedback.feedbackId,
      taskId: task.taskId,
      autoScore: autoScoreValue
    }, 'auto feedback created')

    return feedback
  }

  /**
   * 用户提交评分，计算综合评分并更新
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {Object} params
   * @param {number} params.userScore - 用户评分 1-5
   * @param {string} [params.comment] - 用户评语
   * @param {string[]} [params.corrections] - 修正建议
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord>}
   */
  async submitUserFeedback(task, params) {
    const { userScore, comment, corrections } = params

    // 查找已有的自动评分记录
    let autoScoreValue
    if (this.#store) {
      const existingFeedbacks = await this.#store.getFeedbacksByTaskId(task.taskId)
      const autoFeedback = existingFeedbacks.find(f => f.source === 'auto')
      autoScoreValue = autoFeedback?.autoScore ?? this.#scorer.compute(task)
    } else {
      autoScoreValue = this.#scorer.compute(task)
    }

    const finalScore = this.#scorer.final(autoScoreValue, userScore)

    const primaryAgentId = task.results?.[0]?.agentId ?? 'unknown'
    const primaryCapability = task.steps?.[0]?.capability ?? ''

    const feedback = createFeedbackRecord({
      taskId: task.taskId,
      conversationId: task.conversationId,
      agentId: primaryAgentId,
      capability: primaryCapability,
      source: 'user',
      userScore,
      autoScore: autoScoreValue,
      finalScore,
      ...(comment != null && { userComment: comment }),
      ...(corrections != null && { corrections: corrections.map(c => ({ text: c })) }),
      taskContext: {
        strategy: task.strategy,
        stepCount: task.steps?.length ?? 0,
        status: task.status
      }
    })

    // 持久化
    await this.#persist(feedback)

    // 事件通知
    this.#eventBus?.emit('feedback.created', feedback)

    // 回传给 Agent
    this.#dispatchFeedbackToAgent(feedback)

    this.#logger.info({
      feedbackId: feedback.feedbackId,
      taskId: task.taskId,
      userScore,
      autoScore: autoScoreValue,
      finalScore
    }, 'user feedback submitted')

    return feedback
  }

  /**
   * 通过 Waggle 消息总线将反馈回传给执行 Agent
   *
   * 仅当 Agent 声明接受反馈时才发送。
   *
   * @param {import('../models/feedback.js').FeedbackRecord} feedback
   */
  #dispatchFeedbackToAgent(feedback) {
    try {
      if (!this.#waggle || !this.#hive) return

      const agent = this.#hive.get(feedback.agentId)
      if (!agent) {
        this.#logger.warn({ agentId: feedback.agentId }, 'agent not found for feedback dispatch')
        return
      }

      // 检查 Agent 是否声明接受反馈
      const acceptsFeedback = agent.constraints?.feedback_accepts_score ?? false
      if (!acceptsFeedback) {
        this.#logger.debug({ agentId: feedback.agentId }, 'agent does not accept feedback, skipping dispatch')
        return
      }

      const message = {
        type: 'task.feedback',
        feedback: {
          feedbackId: feedback.feedbackId,
          taskId: feedback.taskId,
          capability: feedback.capability,
          finalScore: feedback.finalScore,
          ...(feedback.userScore != null && { userScore: feedback.userScore }),
          ...(feedback.userComment != null && { userComment: feedback.userComment }),
          ...(feedback.corrections != null && { corrections: feedback.corrections })
        },
        createdAt: Date.now(),
        priority: 3
      }

      this.#waggle.publish(feedback.agentId, message).catch(err => {
        this.#logger.warn({ err: err.message, agentId: feedback.agentId }, 'failed to dispatch feedback to agent')
      })

      this.#logger.info({ agentId: feedback.agentId, feedbackId: feedback.feedbackId }, 'feedback dispatched to agent')
    } catch (err) {
      // 反馈回传失败不应影响主流程
      this.#logger.warn({ err: err.message, agentId: feedback.agentId }, 'unexpected error during feedback dispatch')
    }
  }

  /**
   * 持久化反馈记录
   *
   * @param {import('../models/feedback.js').FeedbackRecord} feedback
   * @returns {Promise<void>}
   */
  async #persist(feedback) {
    if (!this.#store) return
    try {
      await this.#store.insertFeedback(feedback)
    } catch (err) {
      this.#logger.warn({ err: err.message, feedbackId: feedback.feedbackId }, 'failed to persist feedback')
    }
  }

  /**
   * 获取指定任务的反馈记录
   *
   * @param {string} taskId
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord[]>}
   */
  async getFeedbacksByTaskId(taskId) {
    if (!this.#store) return []
    return this.#store.getFeedbacksByTaskId(taskId)
  }
}
