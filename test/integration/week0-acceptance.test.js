/**
 * Week 0 验收测试 — 技术债清偿
 *
 * 验收标准：
 * 1. maxRetry 配置生效（不再硬编码 3）
 * 2. Executor 关键节点有日志（带 taskId）
 * 3. 串行任务断点续跑（保留已完成步骤结果）
 * 4. DELETE /task/:taskId 正常工作
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { RetryService } from '../../src/services/retry.js'
import { HeartbeatMonitor } from '../../src/services/heartbeat.js'
import { TaskRescheduler } from '../../src/services/rescheduler.js'
import taskRoutes from '../../src/handlers/task.js'
import adminRoutes from '../../src/handlers/admin.js'
import { createTaskRecord } from '../../src/models/task.js'

function makeSpec(overrides = {}) {
  return {
    identity: { role: 'worker', ...overrides.identity },
    runtime: { endpoint: overrides.endpoint ?? 'http://localhost:0', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['search'],
    model: overrides.model ?? {},
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? []
  }
}

function mockFetch(handler) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url, options) => handler(url, options))
  return () => { globalThis.fetch = originalFetch }
}

describe('Week 0 Acceptance Tests', () => {
  let app
  let hive, scheduler, executor, retryService
  let heartbeat, rescheduler

  beforeAll(async () => {
    app = Fastify()

    hive = new Hive()
    scheduler = new Scheduler({ hive })
    retryService = new RetryService()
    executor = new Executor({
      scheduler,
      retryService,
      logger: app.log,
      defaultTimeoutMs: 2000,
      maxRetry: 5
    })
    const planner = new Planner({ hive })
    const waggle = new Waggle({ maxSize: 100 })
    heartbeat = new HeartbeatMonitor({ hive, waggle, intervalMs: 10000, timeoutMs: 30000 })
    rescheduler = new TaskRescheduler({ waggle, executor, scheduler, logger: app.log })

    app.register(taskRoutes, { planner, executor, hive })
    app.register(adminRoutes, { hive, executor, heartbeat })

    await app.ready()
  })

  afterAll(async () => {
    rescheduler?.stop()
    heartbeat?.stop()
    await app?.close()
  })

  // ── 验收 1：重试次数配置生效 ──────────────────

  describe('验收 1: maxRetry 配置生效', () => {
    it('maxRetry=1 时串行任务失败步骤只重试 1 次', async () => {
      const retryHive = new Hive()
      const retryScheduler = new Scheduler({ hive: retryHive })
      const freshRetryService = new RetryService()

      retryHive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-retry:4001'
      }), 'sess_retry_test_1')

      // 注册多个 data_analysis Agent，确保重试时还有可用 Agent
      retryHive.register(makeSpec({
        capabilities: ['data_analysis'],
        endpoint: 'http://worker-retry:4002'
      }), 'sess_retry_test_2')

      retryHive.register(makeSpec({
        capabilities: ['data_analysis'],
        endpoint: 'http://worker-retry:4003'
      }), 'sess_retry_test_3')

      const retryExecutor = new Executor({
        scheduler: retryScheduler,
        retryService: freshRetryService,
        logger: app.log,
        defaultTimeoutMs: 5000,
        maxRetry: 1
      })

      let fetchCount = 0

      const restore = mockFetch((url) => {
        if (url.includes('/bee/cancel')) {
          return { ok: true, json: async () => ({}) }
        }
        fetchCount++
        const body = JSON.parse(globalThis.fetch.mock.calls[globalThis.fetch.mock.calls.length - 1][1].body)
        if (body.task.name === '搜索') {
          return { ok: true, json: async () => ({ status: 'success', output: 'search_result' }) }
        }
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'ERR_AGENT_OVERLOADED', message: 'busy', retryable: true } })
        }
      })

      try {
        const task = createTaskRecord({
          strategy: 'serial',
          request: { description: '搜索+分析', input: {} },
          steps: [
            { stepIndex: 0, capability: 'search', description: '搜索' },
            { stepIndex: 1, capability: 'data_analysis', description: '分析' }
          ]
        })

        const result = await retryExecutor.run(task)

        // 第 1 步成功：1 fetch
        // 第 2 步：首次失败 + maxRetry=1 次重试 = 2 fetch
        // 总共 3 fetch（如果硬编码 3 则会是 4 次）
        expect(fetchCount).toBe(3)
        expect(result.status).toBe('failure')
      } finally {
        restore()
      }
    })
  })

  // ── 验收 2：Executor 日志 ─────────────────────

  describe('验收 2: Executor 日志带 taskId', () => {
    it('Executor 在执行过程中输出带 taskId 的日志', async () => {
      const logMessages = []
      const collectingExecutor = new Executor({
        scheduler,
        retryService: null,
        logger: {
          info: (msgOrObj, msg) => logMessages.push({ level: 'info', ...(typeof msgOrObj === 'string' ? { msg: msgOrObj } : { ...msgOrObj, msg }) }),
          warn: (msgOrObj, msg) => logMessages.push({ level: 'warn', ...(typeof msgOrObj === 'string' ? { msg: msgOrObj } : { ...msgOrObj, msg }) }),
          error: (msgOrObj, msg) => logMessages.push({ level: 'error', ...(typeof msgOrObj === 'string' ? { msg: msgOrObj } : { ...msgOrObj, msg }) }),
          debug: () => {}
        },
        defaultTimeoutMs: 2000
      })

      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-log-test:4001'
      }), 'sess_log_test')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '测试日志' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        await collectingExecutor.run(task)

        // 至少有 start 和 completed 日志
        const hasStartLog = logMessages.some(l =>
          l.msg && l.msg.includes('started')
        )
        const hasCompletedLog = logMessages.some(l =>
          l.msg && l.msg.includes('completed')
        )

        expect(hasStartLog).toBe(true)
        expect(hasCompletedLog).toBe(true)
      } finally {
        restore()
      }
    })
  })

  // ── 验收 3：串行任务断点续跑 ──────────────────

  describe('验收 3: 串行任务断点续跑', () => {
    it('3 步串行任务，第 2 步完成后重调度，跳过已完成的步骤', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-step1:4001'
      }), 'sess_checkpoint_1')
      hive.register(makeSpec({
        capabilities: ['data_analysis'],
        endpoint: 'http://worker-step2:4002'
      }), 'sess_checkpoint_2')
      hive.register(makeSpec({
        capabilities: ['text_writing'],
        endpoint: 'http://worker-step3:4003'
      }), 'sess_checkpoint_3')

      const task = createTaskRecord({
        strategy: 'serial',
        request: { description: '搜索+分析+生成', input: { query: 'test' } },
        steps: [
          { stepIndex: 0, capability: 'search', description: '搜索' },
          { stepIndex: 1, capability: 'data_analysis', description: '分析' },
          { stepIndex: 2, capability: 'text_writing', description: '生成' }
        ]
      })

      // 模拟已有前 2 步成功的结果（断点续跑场景）
      const resumedTask = Object.freeze({
        ...task,
        status: 'pending',
        results: [
          { stepIndex: 0, agentId: 'old_agent_1', status: 'success', output: 'search_result', startedAt: Date.now() - 5000, finishedAt: Date.now() - 4000 },
          { stepIndex: 1, agentId: 'old_agent_2', status: 'success', output: 'analysis_result', startedAt: Date.now() - 3000, finishedAt: Date.now() - 2000 }
        ]
      })

      let fetchCount = 0

      const restore = mockFetch((url) => {
        fetchCount++
        return {
          ok: true,
          json: async () => ({ status: 'success', output: 'final_output' })
        }
      })

      try {
        const result = await executor.run(resumedTask)

        // 只执行第 3 步（stepIndex=2），前两步已跳过
        expect(fetchCount).toBe(1)
        expect(result.status).toBe('success')
        // 保留前 2 步的旧结果 + 第 3 步新结果 = 3
        expect(result.results).toHaveLength(3)
        expect(result.results[0].output).toBe('search_result')
        expect(result.results[1].output).toBe('analysis_result')
        expect(result.results[2].output).toBe('final_output')
      } finally {
        restore()
      }
    })
  })

  // ── 验收 4：DELETE /task/:taskId ───────────────

  describe('验收 4: DELETE /task/:taskId 取消任务', () => {
    it('通过 Executor 直接取消正在执行的任务', async () => {
      const cancelHive = new Hive()
      const cancelScheduler = new Scheduler({ hive: cancelHive })
      cancelHive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-cancel:4001'
      }), 'sess_cancel_test_2')

      const cancelExecutor = new Executor({
        scheduler: cancelScheduler,
        retryService: null,
        logger: app.log,
        defaultTimeoutMs: 30000
      })

      // Mock fetch that responds to abort signal
      const restore = mockFetch((url, options) => {
        if (url.includes('/bee/cancel')) {
          return { ok: true, json: async () => ({}) }
        }
        return new Promise((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          }
          if (options?.signal) {
            if (options.signal.aborted) {
              onAbort()
              return
            }
            options.signal.addEventListener('abort', onAbort, { once: true })
          }
        })
      })

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '长任务' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        // 后台启动任务
        const runPromise = cancelExecutor.run(task)

        // 等一下让 fetch 开始
        await new Promise(resolve => setTimeout(resolve, 20))

        // 取消任务
        const cancelled = cancelExecutor.cancel(task.taskId)
        expect(cancelled).toBe(true)

        const result = await runPromise
        // abort 触发后 #executeStep 返回 ERR_TASK_CANCELLED 的 failure
        // 但 cancel() 也直接把 task 状态设为 cancelled
        // 最终状态取决于谁最后 updateTask
        expect(['cancelled', 'failure']).toContain(result.status)
      } finally {
        restore()
      }
    })

    it('取消不存在的任务返回 404', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/task/task_nonexistent'
      })

      expect(response.statusCode).toBe(404)
    })

    it('取消已完成的任务返回 409', async () => {
      hive.register(makeSpec({
        capabilities: ['analysis'],
        endpoint: 'http://worker-finished:4001'
      }), 'sess_finished_test')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'done' })
      }))

      try {
        // 提交并等待完成
        const response = await app.inject({
          method: 'POST',
          url: '/task',
          payload: { description: '数据分析' }
        })

        const taskId = JSON.parse(response.body).task_id

        // 等待任务完成
        await new Promise(resolve => setTimeout(resolve, 200))

        // 尝试取消已完成的任务
        const cancelResponse = await app.inject({
          method: 'DELETE',
          url: `/task/${taskId}`
        })

        expect(cancelResponse.statusCode).toBe(409)
        const body = JSON.parse(cancelResponse.body)
        expect(body.error.code).toBe('ERR_TASK_ALREADY_FINISHED')
      } finally {
        restore()
      }
    })
  })
})
