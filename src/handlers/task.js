/**
 * 任务路由
 *
 * POST /task  — 创建并异步执行任务
 * GET  /task/:taskId — 查询任务状态
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
      task_id: task.taskId,
      status: task.status,
      strategy: task.strategy,
      results: (task.results ?? []).map(r => ({
        step_index: r.stepIndex,
        agent_id: r.agentId,
        status: r.status,
        ...(r.output !== undefined && { output: r.output }),
        ...(r.summary != null && { summary: r.summary }),
        ...(r.error != null && { error: r.error })
      })),
      ...(finalOutput !== null && { final_output: finalOutput }),
      created_at: new Date(task.createdAt).toISOString(),
      ...(task.startedAt != null && { started_at: new Date(task.startedAt).toISOString() }),
      ...(task.finishedAt != null && { finished_at: new Date(task.finishedAt).toISOString() })
    })
  })
}
