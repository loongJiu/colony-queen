/**
 * POST /task/:taskId/feedback 端点测试
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { FeedbackService } from '../../src/services/feedback-service.js'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { NotFoundError, ValidationError } from '../../src/utils/errors.js'
import taskRoutes from '../../src/handlers/task.js'
import { createTaskRecord } from '../../src/models/task.js'

function makeCompletedTask(overrides = {}) {
  const now = Date.now()
  return createTaskRecord({
    strategy: 'single',
    request: { description: '搜索任务' },
    steps: [{ stepIndex: 0, capability: 'search', description: '搜索步骤' }],
    ...overrides
  })
}

describe('POST /task/:taskId/feedback', () => {
  let app
  let hive
  let executor
  let feedbackService
  let store

  beforeAll(async () => {
    app = Fastify()

    hive = new Hive()
    const scheduler = new Scheduler({ hive })
    const planner = new Planner({ hive })
    executor = new Executor({ scheduler })
    store = new MemoryStore()
    await store.init()
    feedbackService = new FeedbackService({ store })

    app.setErrorHandler((err, request, reply) => {
      if (err instanceof NotFoundError) {
        return reply.status(404).send(err.toJSON(request.id))
      }
      if (err instanceof ValidationError) {
        return reply.status(400).send(err.toJSON(request.id))
      }
      reply.status(500).send({ error: { code: 'ERR_INTERNAL', message: err.message } })
    })

    app.register(taskRoutes, { planner, executor, feedbackService })

    await app.ready()
  })

  afterAll(async () => {
    await store.close()
    await app.close()
  })

  it('returns 404 for non-existent task', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/task/task_nonexistent/feedback',
      payload: { userScore: 4 }
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('ERR_NOT_FOUND')
  })

  it('returns 409 for task that is not finished', async () => {
    // 注册一个 pending 任务到 executor
    const task = makeCompletedTask()
    executor.registerDraft(task)

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 4 }
    })

    expect(response.statusCode).toBe(409)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('ERR_TASK_NOT_FINISHED')
  })

  it('returns 400 for missing userScore', async () => {
    const task = makeCompletedTask()
    // 模拟已完成的任务
    executor.registerDraft({ ...task, status: 'success', results: [{ stepIndex: 0, agentId: 'agent_001', status: 'success', startedAt: Date.now() }] })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: {}
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('ERR_VALIDATION')
  })

  it('returns 400 for invalid userScore (0)', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({ ...task, status: 'success', results: [{ stepIndex: 0, agentId: 'agent_001', status: 'success', startedAt: Date.now() }] })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 0 }
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for invalid userScore (6)', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({ ...task, status: 'success', results: [{ stepIndex: 0, agentId: 'agent_001', status: 'success', startedAt: Date.now() }] })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 6 }
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for non-integer userScore', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({ ...task, status: 'success', results: [{ stepIndex: 0, agentId: 'agent_001', status: 'success', startedAt: Date.now() }] })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 3.5 }
    })

    expect(response.statusCode).toBe(400)
  })

  it('successfully submits feedback with valid userScore', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({
      ...task,
      status: 'success',
      results: [{
        stepIndex: 0,
        agentId: 'agent_001',
        status: 'success',
        startedAt: Date.now(),
        finishedAt: Date.now()
      }]
    })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 4, comment: '还不错' }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.type).toBe('task.feedback')
    expect(body.userScore).toBe(4)
    expect(body.userComment).toBe('还不错')
    expect(body.feedbackId).toMatch(/^fb_/)
    expect(body.source).toBe('user')
    expect(body.finalScore).toBeGreaterThanOrEqual(0)
    expect(body.finalScore).toBeLessThanOrEqual(1)
  })

  it('accepts corrections in feedback', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({
      ...task,
      status: 'success',
      results: [{
        stepIndex: 0,
        agentId: 'agent_001',
        status: 'success',
        startedAt: Date.now(),
        finishedAt: Date.now()
      }]
    })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: {
        userScore: 2,
        comment: '需要改进',
        corrections: ['增加更多细节', '格式不正确']
      }
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.corrections).toHaveLength(2)
    expect(body.corrections[0].text).toBe('增加更多细节')
  })

  it('allows feedback on failed task', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({
      ...task,
      status: 'failure',
      results: [{
        stepIndex: 0,
        agentId: 'agent_001',
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
        startedAt: Date.now(),
        finishedAt: Date.now()
      }]
    })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 1 }
    })

    expect(response.statusCode).toBe(201)
  })

  it('allows feedback on partial task', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({
      ...task,
      status: 'partial',
      results: [{
        stepIndex: 0,
        agentId: 'agent_001',
        status: 'success',
        startedAt: Date.now(),
        finishedAt: Date.now()
      }]
    })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 3 }
    })

    expect(response.statusCode).toBe(201)
  })
})

describe('POST /task/:taskId/feedback without feedbackService', () => {
  let app
  let hive
  let executor

  beforeAll(async () => {
    app = Fastify()

    hive = new Hive()
    const scheduler = new Scheduler({ hive })
    const planner = new Planner({ hive })
    executor = new Executor({ scheduler })

    app.setErrorHandler((err, request, reply) => {
      if (err instanceof NotFoundError) {
        return reply.status(404).send(err.toJSON(request.id))
      }
      if (err instanceof ValidationError) {
        return reply.status(400).send(err.toJSON(request.id))
      }
      reply.status(500).send({ error: { code: 'ERR_INTERNAL', message: err.message } })
    })

    // 不提供 feedbackService
    app.register(taskRoutes, { planner, executor })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 503 when feedbackService is not available', async () => {
    const task = makeCompletedTask()
    executor.registerDraft({
      ...task,
      status: 'success',
      results: [{
        stepIndex: 0,
        agentId: 'agent_001',
        status: 'success',
        startedAt: Date.now(),
        finishedAt: Date.now()
      }]
    })

    const response = await app.inject({
      method: 'POST',
      url: `/task/${task.taskId}/feedback`,
      payload: { userScore: 4 }
    })

    expect(response.statusCode).toBe(503)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('ERR_FEEDBACK_SERVICE_UNAVAILABLE')
  })
})
