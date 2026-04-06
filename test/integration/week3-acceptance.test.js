/**
 * Week 3 验收测试
 *
 * 验收标准：提交一个需要搜索+分析两步的任务，
 * 两个 Worker 依次执行，结果正确返回。
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
    capabilities: overrides.capabilities ?? [],
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

describe('Week 3 验收', () => {
  it('搜索+分析两步串行任务，两个 Worker 依次执行，结果正确返回', async () => {
    // 1. 初始化系统
    const hive = new Hive()
    const scheduler = new Scheduler({ hive })
    const planner = new Planner({ hive })
    const executor = new Executor({ scheduler, defaultTimeoutMs: 5000 })

    // 2. 注册两个 Worker
    const searcher = hive.register(makeSpec({
      identity: { name: 'SearchWorker' },
      capabilities: ['search'],
      endpoint: 'http://search-worker:4001'
    }), 'sess_search')

    const analyst = hive.register(makeSpec({
      identity: { name: 'AnalysisWorker' },
      capabilities: ['data_analysis'],
      endpoint: 'http://analysis-worker:4002'
    }), 'sess_analysis')

    expect(hive.size).toBe(2)

    // 3. Mock Worker 响应
    const calls = []
    const restore = mockFetch((url, options) => {
      const body = JSON.parse(options.body)
      calls.push({ url, type: body.type, input: body.task.input })

      if (url.includes('search-worker')) {
        // 搜索 Worker 返回搜索结果
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            output: {
              documents: [
                { id: 1, title: '报告A', score: 0.95 },
                { id: 2, title: '报告B', score: 0.87 }
              ],
              total: 2
            },
            summary: '找到2份相关报告',
            usage: { input_tokens: 20, output_tokens: 50 }
          })
        }
      }

      if (url.includes('analysis-worker')) {
        // 分析 Worker 接收到搜索结果作为输入
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            output: {
              insight: '报告A和报告B呈正相关趋势',
              confidence: 0.92,
              recommendation: '建议进一步调查报告A'
            },
            summary: '分析完成，发现正相关趋势',
            usage: { input_tokens: 100, output_tokens: 80 }
          })
        }
      }

      return { ok: false, status: 404, json: async () => ({}) }
    })

    try {
      // 4. 规划任务
      const plan = await planner.analyzePlan('搜索相关报告然后进行数据分析', {
        input: { query: '市场趋势报告', year: 2026 }
      })

      expect(plan.strategy).toBe('serial')
      expect(plan.steps).toHaveLength(2)
      expect(plan.steps[0].capability).toBe('search')
      expect(plan.steps[1].capability).toBe('data_analysis')

      // 5. 构建任务
      const task = buildTasksFromPlan(plan, {
        description: '搜索相关报告然后进行数据分析',
        input: { query: '市场趋势报告', year: 2026 }
      })

      expect(task.status).toBe('pending')
      expect(task.strategy).toBe('serial')

      // 6. 执行任务
      const result = await executor.run(task)

      // 7. 验证执行结果
      expect(result.status).toBe('success')
      expect(result.results).toHaveLength(2)

      // 第一步：搜索
      expect(result.results[0].stepIndex).toBe(0)
      expect(result.results[0].agentId).toBe(searcher.agentId)
      expect(result.results[0].status).toBe('success')
      expect(result.results[0].output.total).toBe(2)
      expect(result.results[0].summary).toBe('找到2份相关报告')

      // 第二步：分析
      expect(result.results[1].stepIndex).toBe(1)
      expect(result.results[1].agentId).toBe(analyst.agentId)
      expect(result.results[1].status).toBe('success')
      expect(result.results[1].output.confidence).toBe(0.92)
      expect(result.results[1].output.recommendation).toBe('建议进一步调查报告A')

      // 验证输入传递
      expect(calls[0].type).toBe('task_assign')
      expect(calls[0].input).toEqual({ query: '市场趋势报告', year: 2026 })
      expect(calls[1].type).toBe('task_assign')
      // 第二步应该收到第一步的 output
      expect(calls[1].input.total).toBe(2)

      // 8. 聚合结果
      const aggregated = merge(result)

      expect(aggregated.status).toBe('success')
      // serial: 取最后一步 output
      expect(aggregated.output.insight).toBe('报告A和报告B呈正相关趋势')
      expect(aggregated.summary).toContain('找到2份相关报告')
      expect(aggregated.summary).toContain('分析完成')
      expect(aggregated.usage.input_tokens).toBe(120) // 20 + 100
      expect(aggregated.usage.output_tokens).toBe(130) // 50 + 80

      // 9. 可通过 getTask 查询
      const stored = executor.getTask(task.taskId)
      expect(stored).toBeDefined()
      expect(stored.status).toBe('success')
      expect(Object.isFrozen(stored)).toBe(true)
    } finally {
      restore()
    }
  })
})
