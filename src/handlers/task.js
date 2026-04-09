/**
 * 任务路由
 *
 * POST   /task                   — 创建并异步执行任务
 * GET    /task/:taskId           — 查询任务状态
 * DELETE /task/:taskId           — 取消任务
 * POST   /task/:taskId/feedback  — 提交用户反馈评分
 */

import { buildTasksFromPlan } from '../core/planner.js'
import { merge } from '../core/aggregator.js'
import { createTaskRecord } from '../models/task.js'
import { genConvId } from '../utils/id.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'

/**
 * 注册任务路由到 Fastify 实例
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   planner: import('../core/planner.js').Planner,
 *   executor: import('../services/executor.js').Executor,
 *   hive: import('../core/hive.js').Hive,
 *   feedbackService?: import('../services/feedback-service.js').FeedbackService
 * }} options
 */
export default function taskRoutes(app, options) {
  const { planner, executor, feedbackService } = options

  // ── POST /task ────────────────────────────────

  app.post('/task', async (request, reply) => {
    const { description, input, expected_output: expectedOutput, constraints } = request.body ?? {}

    if (!description) {
      throw new ValidationError('Missing required field: description')
    }

    // 0. 可用性预检
    const check = planner.precheck(description)
    if (!check.feasible) {
      return reply.status(503).send({
        error: {
          code: 'ERR_NO_CAPABLE_AGENT',
          message: '没有可用的 Agent 处理该请求',
          requestId: request.id,
          retryable: true,
          details: {
            missingCapabilities: check.missingCapabilities,
            suggestions: check.suggestions,
            totalActiveAgents: check.totalActiveAgents
          }
        }
      })
    }

    // 1. 立即创建 draft task（planning 状态）
    const draftTask = createTaskRecord({
      conversationId: genConvId(),
      strategy: 'single',
      request: {
        description,
        ...(input !== undefined && { input }),
        ...(expectedOutput != null && { expectedOutput }),
        ...(constraints != null && { constraints })
      },
      steps: [{ stepIndex: 0, capability: 'general', description: 'Planning...' }]
    })

    const planningTask = Object.freeze({ ...draftTask, status: 'planning' })
    executor.registerDraft(planningTask)

    // 2. 立即返回 202（不等规划完成）
    request.log.info({ taskId: planningTask.taskId }, 'Task draft created, planning in background')

    reply.status(202).send({
      type: 'task.created',
      task_id: planningTask.taskId,
      status: 'planning',
      created_at: new Date(planningTask.createdAt).toISOString()
    })

    // 3. 后台异步规划 + 执行
    const appLog = request.log
    setImmediate(async () => {
      try {
        const plan = await planner.analyzePlan(description, { input, expectedOutput, constraints })
        const task = buildTasksFromPlan(plan, {
          description,
          ...(input !== undefined && { input }),
          ...(expectedOutput != null && { expectedOutput }),
          ...(constraints != null && { constraints })
        }, planningTask.taskId)

        // 重放规划日志到 executor 的日志系统
        if (plan.planLogs?.length > 0) {
          for (const log of plan.planLogs) {
            // 利用 executor 的 emitLog 通过 registerDraft 注册的 taskLogs
            const logs = executor.getTaskLogs(planningTask.taskId)
            if (logs) {
              logs.push({ taskId: planningTask.taskId, source: log.source || 'planner', message: log.message, timestamp: log.timestamp, level: log.level || 'info' })
            }
          }
        }

        // 更新 draft 为完整的 planned task（保留同一个 taskId）
        executor.updateTaskStatus(planningTask.taskId, {
          ...task,
          taskId: planningTask.taskId,
          status: 'pending',
          results: []
        })

        // 开始执行
        await executor.run({ ...task, taskId: planningTask.taskId })
      } catch (err) {
        appLog.error({ err, taskId: planningTask.taskId }, 'Task planning failed')
        executor.updateTaskStatus(planningTask.taskId, {
          status: 'failure',
          finishedAt: Date.now()
        })
      }
    })
  })

  // ── GET /task/:taskId ─────────────────────────

  app.get('/task/:taskId', async (request, reply) => {
    const { taskId } = request.params

    const task = executor.getTask(taskId)
    if (!task) {
      throw new NotFoundError(`Task "${taskId}" not found`)
    }

    // 已完成（非 pending/running）时计算最终聚合输出
    let finalOutput = task.finalOutput ?? null
    if (['success', 'failure', 'partial'].includes(task.status) && task.results?.length > 0) {
      const aggregated = merge(task)
      finalOutput = aggregated.output
    }

    reply.status(200).send({
      type: 'task.status',
      ...task,
      ...(finalOutput !== null && { finalOutput }),
      logs: executor.getTaskLogs(taskId)
    })
  })

  // ── DELETE /task/:taskId ──────────────────────

  app.delete('/task/:taskId', async (request, reply) => {
    const { taskId } = request.params

    const task = executor.getTask(taskId)
    if (!task) {
      throw new NotFoundError(`Task "${taskId}" not found`)
    }

    if (['success', 'failure', 'cancelled'].includes(task.status)) {
      return reply.status(409).send({
        error: {
          code: 'ERR_TASK_ALREADY_FINISHED',
          message: `任务已处于终态：${task.status}，无法取消`,
          requestId: request.id,
          retryable: false
        }
      })
    }

    const cancelled = executor.cancel(taskId)

    if (!cancelled) {
      return reply.status(409).send({
        error: {
          code: 'ERR_CANCEL_FAILED',
          message: '任务取消失败，可能已执行完成',
          requestId: request.id,
          retryable: false
        }
      })
    }

    request.log.info({ taskId }, 'task cancelled via HTTP')

    reply.status(200).send({
      type: 'task.cancelled',
      task_id: taskId,
      cancelled: true
    })
  })

  // ── POST /task/:taskId/feedback ──────────────

  app.post('/task/:taskId/feedback', async (request, reply) => {
    const { taskId } = request.params
    const { userScore, comment, corrections } = request.body ?? {}

    const task = executor.getTask(taskId)
    if (!task) {
      throw new NotFoundError(`Task "${taskId}" not found`)
    }

    // 验证任务已完成
    if (!['success', 'failure', 'partial'].includes(task.status)) {
      return reply.status(409).send({
        error: {
          code: 'ERR_TASK_NOT_FINISHED',
          message: `任务尚未完成，当前状态：${task.status}`,
          requestId: request.id,
          retryable: false
        }
      })
    }

    // 验证 userScore
    if (userScore == null || !Number.isInteger(userScore) || userScore < 1 || userScore > 5) {
      throw new ValidationError('userScore is required and must be an integer between 1 and 5')
    }

    // 检查 feedbackService
    if (!feedbackService) {
      return reply.status(503).send({
        error: {
          code: 'ERR_FEEDBACK_SERVICE_UNAVAILABLE',
          message: '反馈服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const feedback = await feedbackService.submitUserFeedback(task, {
      userScore,
      comment,
      corrections
    })

    request.log.info({ taskId, feedbackId: feedback.feedbackId, userScore }, 'user feedback submitted')

    reply.status(201).send({
      type: 'task.feedback',
      ...feedback
    })
  })
}
