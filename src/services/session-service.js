/**
 * SessionService — 工作会话服务
 *
 * 管理 WorkSession 的生命周期，提供跨任务上下文引用能力。
 * 同一工作会话下的任务可以引用彼此的关键产出。
 */

import { createWorkSessionRecord } from '../models/work-session.js'

export class SessionService {
  /** @type {Object} */
  #store

  /** @type {Object} */
  #logger

  /**
   * @param {{
   *   store: Object,
   *   logger?: Object
   * }} deps
   */
  constructor({ store, logger = console }) {
    this.#store = store
    this.#logger = logger
  }

  /**
   * 创建工作会话
   *
   * @param {string} title - 会话标题
   * @param {Object} [sharedContext] - 初始共享上下文
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord>}
   */
  async createSession(title, sharedContext) {
    const record = createWorkSessionRecord({
      title,
      ...(sharedContext != null && { sharedContext })
    })

    await this.#store.insertSession(record)

    this.#logger.info({ sessionId: record.sessionId, title }, 'work session created')
    return record
  }

  /**
   * 获取工作会话
   *
   * @param {string} sessionId
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async getSession(sessionId) {
    return this.#store.getSession(sessionId)
  }

  /**
   * 向会话添加一个对话（任务完成后调用）
   *
   * @param {string} sessionId
   * @param {string} conversationId
   * @param {Object} [keyOutput] - 该对话的关键产出 { type, summary }
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async addConversation(sessionId, conversationId, keyOutput) {
    const session = await this.#store.getSession(sessionId)
    if (!session) return null

    const conversationIds = [...session.conversationIds]
    if (!conversationIds.includes(conversationId)) {
      conversationIds.push(conversationId)
    }

    const keyOutputs = { ...session.keyOutputs }
    if (keyOutput) {
      keyOutputs[conversationId] = keyOutput
    }

    const updated = await this.#store.updateSession(sessionId, {
      conversationIds,
      keyOutputs
    })

    this.#logger.info({ sessionId, conversationId }, 'conversation added to session')
    return updated
  }

  /**
   * 添加共享上下文
   *
   * @param {string} sessionId
   * @param {Object} context - 要合并的上下文对象
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async addSharedContext(sessionId, context) {
    const session = await this.#store.getSession(sessionId)
    if (!session) return null

    const sharedContext = { ...session.sharedContext, ...context }

    return this.#store.updateSession(sessionId, { sharedContext })
  }

  /**
   * 列出工作会话
   *
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @param {string} [options.status]
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord[]>}
   */
  async listSessions(options) {
    return this.#store.listSessions(options)
  }

  /**
   * 归档工作会话
   *
   * @param {string} sessionId
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async archiveSession(sessionId) {
    const updated = await this.#store.updateSession(sessionId, { status: 'archived' })

    if (updated) {
      this.#logger.info({ sessionId }, 'work session archived')
    }
    return updated
  }

  /**
   * 解析引用：获取被引用对话的 keyOutputs 集合
   *
   * 这是跨任务上下文引用的核心方法。
   * 查询会话中指定 conversationId 对应的关键产出。
   *
   * @param {string} sessionId
   * @param {string[]} referenceConversationIds - 要引用的 conversationId 列表
   * @returns {Promise<Object>} - { references: { [conversationId]: { type, summary } }, sharedContext: Object }
   */
  async resolveReferences(sessionId, referenceConversationIds) {
    const session = await this.#store.getSession(sessionId)
    if (!session) {
      return { references: {}, sharedContext: {} }
    }

    const references = {}
    for (const convId of referenceConversationIds) {
      const output = session.keyOutputs[convId]
      if (output) {
        references[convId] = output
      }
    }

    return {
      references,
      sharedContext: session.sharedContext
    }
  }

  /**
   * 从任务结果中提取关键产出摘要
   *
   * @param {Object} taskResult - 任务执行结果
   * @param {string} taskResult.status
   * @param {string} [taskResult.output]
   * @param {Object[]} [taskResult.steps]
   * @returns {{ type: string, summary: string }}
   */
  extractKeyOutput(taskResult) {
    if (!taskResult) {
      return { type: 'empty', summary: '' }
    }

    // 提取最终输出
    const output = taskResult.finalOutput ?? taskResult.output
    if (output) {
      const summary = typeof output === 'string'
        ? output.slice(0, 500)
        : JSON.stringify(output).slice(0, 500)
      return { type: 'output', summary }
    }

    // 从步骤结果中提取
    const steps = taskResult.steps ?? []
    if (steps.length > 0) {
      const parts = steps
        .filter(s => s.description)
        .map(s => s.description)
        .join('; ')
      return { type: 'steps', summary: parts.slice(0, 500) || '任务已执行' }
    }

    return {
      type: 'status',
      summary: `任务状态: ${taskResult.status || 'unknown'}`
    }
  }
}
