/**
 * 任务流集成测试
 *
 * 测试完整链路：Planner → Executor → Aggregator
 * 使用 mock fetch 模拟 Worker 响应
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner, buildTasksFromPlan } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { merge } from '../../src/core/aggregator.js'

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

describe('Task Flow Integration', () => {
  let hive, scheduler, planner, executor

  beforeEach(() => {
    hive = new Hive()
    scheduler = new Scheduler({ hive })
    planner = new Planner({ hive })
    executor = new Executor({ scheduler, defaultTimeoutMs: 5000 })
  })

  describe('single task end-to-end', () => {
    it('plans, builds, executes, and aggregates a single task', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-search:4001'
      }), 'sess_search')

      const restore = mockFetch((url, options) => {
        expect(url).toBe('http://worker-search:4001/bee/task')
        const body = JSON.parse(options.body)
        expect(body.type).toBe('task_assign')
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            output: { results: ['doc1', 'doc2'] },
            summary: '找到2个结果',
            usage: { input_tokens: 50, output_tokens: 100 }
          })
        }
      })

      try {
        // 1. Plan
        const plan = await planner.analyzePlan('搜索相关信息', { input: { q: 'test' } })
        expect(plan.strategy).toBe('single')

        // 2. Build
        const task = buildTasksFromPlan(plan, {
          description: '搜索相关信息',
          input: { q: 'test' }
        })

        // 3. Execute
        const result = await executor.run(task)
        expect(result.status).toBe('success')
        expect(result.results[0].output).toEqual({ results: ['doc1', 'doc2'] })

        // 4. Aggregate
        const aggregated = merge(result)
        expect(aggregated.status).toBe('success')
        expect(aggregated.output).toEqual({ results: ['doc1', 'doc2'] })
        expect(aggregated.summary).toContain('找到2个结果')
        expect(aggregated.usage.input_tokens).toBe(50)
      } finally {
        restore()
      }
    })
  })

  describe('serial task chain', () => {
    it('executes search then analysis sequentially', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-search:4001'
      }), 'sess_search')
      hive.register(makeSpec({
        capabilities: ['data_analysis'],
        endpoint: 'http://worker-analysis:4002'
      }), 'sess_analysis')

      let callCount = 0
      const restore = mockFetch((url, options) => {
        callCount++
        const body = JSON.parse(options.body)
        if (url.includes('worker-search')) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              output: { raw_data: [1, 2, 3] },
              summary: '搜索完成'
            })
          }
        }
        // 第二步应该收到第一步的 output 作为 input
        expect(body.task.input).toEqual({ raw_data: [1, 2, 3] })
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            output: { analysis: '平均值为2' },
            summary: '分析完成'
          })
        }
      })

      try {
        const plan = await planner.analyzePlan('搜索数据然后进行分析', { input: { q: 'test' } })
        expect(plan.strategy).toBe('serial')

        const task = buildTasksFromPlan(plan, {
          description: '搜索数据然后进行分析',
          input: { q: 'test' }
        })

        const result = await executor.run(task)

        expect(result.status).toBe('success')
        expect(result.results).toHaveLength(2)
        expect(callCount).toBe(2)

        const aggregated = merge(result)
        expect(aggregated.status).toBe('success')
        // serial: 取最后一步 output
        expect(aggregated.output).toEqual({ analysis: '平均值为2' })
      } finally {
        restore()
      }
    })
  })

  describe('parallel tasks', () => {
    it('executes search and code generation in parallel', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-search:4001'
      }), 'sess_search')
      hive.register(makeSpec({
        capabilities: ['code_generation'],
        endpoint: 'http://worker-code:4002'
      }), 'sess_code')

      const restore = mockFetch((url, options) => {
        if (url.includes('worker-search')) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              output: { found: true },
              summary: '搜索完成'
            })
          }
        }
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            output: { code: 'print("hello")' },
            summary: '代码生成完成'
          })
        }
      })

      try {
        const plan = await planner.analyzePlan('搜索与代码生成', { input: {} })
        expect(plan.strategy).toBe('parallel')

        const task = buildTasksFromPlan(plan, {
          description: '搜索与代码生成',
          input: {}
        })

        const result = await executor.run(task)

        expect(result.status).toBe('success')
        expect(result.results).toHaveLength(2)

        const aggregated = merge(result)
        expect(aggregated.status).toBe('success')
        // parallel: 数组
        expect(Array.isArray(aggregated.output)).toBe(true)
        expect(aggregated.output).toHaveLength(2)
      } finally {
        restore()
      }
    })
  })

  describe('worker failure', () => {
    it('returns failure when worker responds with error', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker-broken:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'ERR_INTERNAL', message: 'Worker crashed', retryable: false } })
      }))

      try {
        const plan = await planner.analyzePlan('搜索', { input: {} })
        const task = buildTasksFromPlan(plan, { description: '搜索', input: {} })
        const result = await executor.run(task)

        expect(result.status).toBe('failure')
        expect(result.results[0].error.code).toBe('ERR_INTERNAL')
      } finally {
        restore()
      }
    })
  })

  describe('no available agent', () => {
    it('returns failure when no agent has required capability', async () => {
      // 注册一个没有搜索能力的 agent
      hive.register(makeSpec({ capabilities: ['code_generation'] }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const plan = await planner.analyzePlan('搜索')
        // 强制使用 search 能力（即使 hive 中没有）
        plan.steps = [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        plan.strategy = 'single'

        const task = buildTasksFromPlan(plan, { description: '搜索' })
        const result = await executor.run(task)

        expect(result.status).toBe('failure')
        expect(result.results[0].error.code).toBe('ERR_NO_AGENT')
      } finally {
        restore()
      }
    })
  })

  describe('precheck integration', () => {
    it('precheck returns feasible when agents are available', () => {
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

      const check = planner.precheck('搜索相关信息')

      expect(check.feasible).toBe(true)
      expect(check.missingCapabilities).toEqual([])
      expect(check.availableCapabilities).toEqual([{ capability: 'search', activeAgents: 1 }])
    })

    it('precheck returns not feasible when capability is missing', () => {
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

      const check = planner.precheck('debugging')

      expect(check.feasible).toBe(false)
      expect(check.missingCapabilities).toContain('debugging')
      expect(check.suggestions).toEqual([{
        requested: 'debugging',
        closest: null
      }])
    })

    it('precheck returns not feasible when all agents are offline', () => {
      const record = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      hive.markOffline(record.agentId)

      const check = planner.precheck('搜索')

      expect(check.feasible).toBe(false)
      expect(check.missingCapabilities).toContain('search')
      expect(check.totalActiveAgents).toBe(0)
    })
  })
})
