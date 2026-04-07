/**
 * 任务路由
 *
 * POST   /task         — 创建并异步执行任务
 * GET    /task/:taskId — 查询任务状态
 * DELETE /task/:taskId — 取消任务
 */

import { buildTasksFromPlan } from '../core/planner.js'
import { merge } from '../core/aggregator.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'

/**
 * 注册任务路由到 Fastify 实例
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   planner: import('../core/planner.js').Planner,
 *   executor: import('../services/executor.js').Executor,
 *   hive: import('../core/hive.js').Hive
 * }} options
 */
export default function taskRoutes(app, options) {
  const { planner, executor } = options

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

    // 1. 分析计划
    const plan = await planner.analyzePlan(description, { input, expectedOutput, constraints })

    // 2. 构建 TaskRecord
    const task = buildTasksFromPlan(plan, {
      description,
      ...(input !== undefined && { input }),
      ...(expectedOutput != null && { expectedOutput }),
      ...(constraints != null && { constraints })
    })

    // 3. 后台执行（非阻塞）
    executor.run(task).catch(err => {
      request.log.error({ err, taskId: task.taskId }, 'Task execution failed unexpectedly')
    })

    request.log.info({ taskId: task.taskId, strategy: task.strategy }, 'Task created')

    // 4. 立即返回 202
    reply.status(202).send({
      type: 'task.created',
      task_id: task.taskId,
      strategy: task.strategy,
      steps: task.steps.map(s => ({
        step_index: s.stepIndex,
        capability: s.capability,
        description: s.description
      })),
      created_at: new Date(task.createdAt).toISOString()
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
      ...(finalOutput !== null && { finalOutput })
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
}
