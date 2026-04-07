import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Executor } from '../../src/services/executor.js'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { createTaskRecord } from '../../src/models/task.js'

function makeSpec(overrides = {}) {
  return {
    identity: { role: 'worker', ...overrides.identity },
    runtime: { endpoint: overrides.endpoint ?? 'http://localhost:0', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['search'],
    model: overrides.model ?? {},
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? [],
    ...(overrides.constraints != null && { constraints: overrides.constraints })
  }
}

/**
 * 创建一个 mock HTTP server 拦截 fetch
 * @param {(url: string, options: Object) => Object} handler
 */
function mockFetch(handler) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url, options) => handler(url, options))
  return () => { globalThis.fetch = originalFetch }
}

describe('Executor', () => {
  let hive, scheduler, executor

  beforeEach(() => {
    hive = new Hive()
    scheduler = new Scheduler({ hive })
    executor = new Executor({ scheduler, defaultTimeoutMs: 2000 })
  })

  describe('run (single)', () => {
    it('executes a single-step task successfully', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch((url, options) => ({
        ok: true,
        json: async () => ({
          status: 'success',
          output: { results: ['item1', 'item2'] },
          summary: '搜索完成',
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索', input: { q: 'test' } },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索步骤' }]
        })

        const result = await executor.run(task)

        expect(result.status).toBe('success')
        expect(result.results).toHaveLength(1)
        expect(result.results[0].status).toBe('success')
        expect(result.results[0].output).toEqual({ results: ['item1', 'item2'] })
        expect(result.startedAt).toBeDefined()
        expect(result.finishedAt).toBeDefined()
        expect(Object.isFrozen(result)).toBe(true)
      } finally {
        restore()
      }
    })

    it('stores task and retrieves via getTask', async () => {
      hive.register(makeSpec({ capabilities: ['search'], endpoint: 'http://w:1' }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)
        const retrieved = executor.getTask(task.taskId)

        expect(retrieved).toBeDefined()
        expect(retrieved.status).toBe('success')
        expect(Object.isFrozen(retrieved)).toBe(true)
      } finally {
        restore()
      }
    })
  })

  describe('run (serial)', () => {
    it('executes serial steps passing output between steps', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')
      hive.register(makeSpec({
        capabilities: ['data_analysis'],
        endpoint: 'http://worker2:4002'
      }), 'sess_2')

      let callCount = 0
      const restore = mockFetch((url, options) => {
        callCount++
        const body = JSON.parse(options.body)
        if (body.task.input?.query) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              output: { data: ['result1', 'result2'] },
              summary: '搜索完成'
            })
          }
        }
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            output: { analysis: 'insight' },
            summary: '分析完成'
          })
        }
      })

      try {
        const task = createTaskRecord({
          strategy: 'serial',
          request: { description: '搜索然后分析', input: { query: 'test' } },
          steps: [
            { stepIndex: 0, capability: 'search', description: '搜索步骤' },
            { stepIndex: 1, capability: 'data_analysis', description: '分析步骤' }
          ]
        })

        const result = await executor.run(task)

        expect(result.status).toBe('success')
        expect(result.results).toHaveLength(2)
        expect(result.results[0].status).toBe('success')
        expect(result.results[1].status).toBe('success')
        expect(callCount).toBe(2)
      } finally {
        restore()
      }
    })

    it('stops on first failure in serial execution', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'ERR_INTERNAL', message: 'Worker error', retryable: false } })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'serial',
          request: { description: '搜索然后分析', input: {} },
          steps: [
            { stepIndex: 0, capability: 'search', description: '搜索' },
            { stepIndex: 1, capability: 'data_analysis', description: '分析' }
          ]
        })

        const result = await executor.run(task)

        expect(result.status).toBe('failure')
        expect(result.results).toHaveLength(1)
        expect(result.results[0].status).toBe('failure')
      } finally {
        restore()
      }
    })
  })

  describe('run (parallel)', () => {
    it('executes parallel tasks and returns partial on mixed results', async () => {
      hive.register(makeSpec({ capabilities: ['search'], endpoint: 'http://w1:1' }), 'sess_1')
      hive.register(makeSpec({ capabilities: ['code_generation'], endpoint: 'http://w2:2' }), 'sess_2')

      let callCount = 0
      const restore = mockFetch((url, options) => {
        callCount++
        const body = JSON.parse(options.body)
        const cap = body.task.name
        if (cap.includes('搜索')) {
          return {
            ok: true,
            json: async () => ({ status: 'success', output: { found: true } })
          }
        }
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'ERR_AGENT_OVERLOADED', message: 'busy', retryable: true } })
        }
      })

      try {
        const task = createTaskRecord({
          strategy: 'parallel',
          request: { description: '搜索和生成代码', input: {} },
          steps: [
            { stepIndex: 0, capability: 'search', description: '搜索步骤' },
            { stepIndex: 1, capability: 'code_generation', description: '代码生成步骤' }
          ]
        })

        const result = await executor.run(task)

        expect(result.status).toBe('partial')
        expect(result.results).toHaveLength(2)
      } finally {
        restore()
      }
    })
  })

  describe('cancel', () => {
    it('returns false for unknown task', () => {
      expect(executor.cancel('task_nonexistent')).toBe(false)
    })

    it('cancels a running task', async () => {
      hive.register(makeSpec({ capabilities: ['search'], endpoint: 'http://w:1' }), 'sess_1')

      let resolveFetch
      const restore = mockFetch(() => new Promise(resolve => {
        resolveFetch = resolve
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const runPromise = executor.run(task)

        // 任务正在执行中
        expect(executor.cancel(task.taskId)).toBe(true)

        // 让 fetch 完成
        resolveFetch({ ok: true, json: async () => ({ status: 'success', output: 'ok' }) })
        await runPromise
      } finally {
        restore()
      }
    })
  })

  describe('error handling', () => {
    it('handles no available agent gracefully', async () => {
      // 不注册任何 agent
      const task = createTaskRecord({
        strategy: 'single',
        request: { description: '搜索' },
        steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
      })

      const result = await executor.run(task)

      expect(result.status).toBe('failure')
      expect(result.results[0].error.code).toBe('ERR_NO_AGENT')
    })

    it('handles timeout and sends cancel to worker', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-slow:4001',
        constraints: { timeout_default: 0.1 }
      }), 'sess_1')

      const executorShort = new Executor({ scheduler, defaultTimeoutMs: 100 })

      let cancelCalled = false
      const restore = mockFetch((url, options) => {
        if (url.includes('/bee/cancel')) {
          cancelCalled = true
          return { ok: true, json: async () => ({}) }
        }
        // 模拟超时：永远不响应
        return new Promise(() => {})
      })

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executorShort.run(task)

        expect(result.status).toBe('failure')
        expect(result.results[0].error.code).toBe('ERR_TIMEOUT')
        expect(cancelCalled).toBe(true)
      } finally {
        restore()
      }
    })

    it('handles network error', async () => {
      hive.register(makeSpec({ capabilities: ['search'], endpoint: 'http://w:1' }), 'sess_1')

      const restore = mockFetch(() => { throw new Error('ECONNREFUSED') })

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)

        expect(result.status).toBe('failure')
        expect(result.results[0].error.code).toBe('ERR_UNKNOWN')
        expect(result.results[0].error.retryable).toBe(true)
      } finally {
        restore()
      }
    })

    it('handles non-2xx response with error body', async () => {
      hive.register(makeSpec({ capabilities: ['search'], endpoint: 'http://w:1' }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { code: 'ERR_AGENT_OVERLOADED', message: 'Too busy', retryable: true } })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)

        expect(result.status).toBe('failure')
        expect(result.results[0].error.code).toBe('ERR_AGENT_OVERLOADED')
      } finally {
        restore()
      }
    })
  })

  describe('immutability', () => {
    it('getTask returns frozen objects', async () => {
      hive.register(makeSpec({ capabilities: ['search'], endpoint: 'http://w:1' }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        await executor.run(task)
        const retrieved = executor.getTask(task.taskId)

        expect(Object.isFrozen(retrieved)).toBe(true)
        expect(() => { retrieved.status = 'hacked' }).toThrow()
      } finally {
        restore()
      }
    })
  })
})
