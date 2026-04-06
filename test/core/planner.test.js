import { describe, it, expect } from 'vitest'
import { Planner, buildTasksFromPlan } from '../../src/core/planner.js'
import { Hive } from '../../src/core/hive.js'

function makeSpec(overrides = {}) {
  return {
    identity: { role: 'worker', ...overrides.identity },
    runtime: { endpoint: 'http://localhost:4001', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['search'],
    model: overrides.model ?? {},
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? []
  }
}

describe('Planner', () => {
  describe('analyzePlan', () => {
    it('returns single strategy for single capability match', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索相关资料')

      expect(plan.strategy).toBe('single')
      expect(plan.steps).toHaveLength(1)
      expect(plan.steps[0].capability).toBe('search')
      expect(plan.conversationId).toMatch(/^conv_/)
    })

    it('returns serial strategy when sequential keywords present', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search', 'data_analysis'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索数据然后进行分析')

      expect(plan.strategy).toBe('serial')
      expect(plan.steps).toHaveLength(2)
      expect(plan.steps[0].capability).toBe('search')
      expect(plan.steps[1].capability).toBe('data_analysis')
    })

    it('returns parallel strategy for multiple capabilities without sequential keywords', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search', 'code_generation'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索和代码生成')

      expect(plan.strategy).toBe('parallel')
      expect(plan.steps).toHaveLength(2)
    })

    it('returns single with general capability when no match found', async () => {
      const hive = new Hive()
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('一些不相关的任务描述')

      expect(plan.strategy).toBe('single')
      expect(plan.steps[0].capability).toBe('general')
    })

    it('matches registered capability names in description', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['custom_capability_xyz'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('执行 custom_capability_xyz 操作')

      expect(plan.strategy).toBe('single')
      expect(plan.steps[0].capability).toBe('custom_capability_xyz')
    })

    it('detects sequential dependency via "之后"', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search', 'data_analysis'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索数据分析之后生成报告')

      expect(plan.strategy).toBe('serial')
    })

    it('detects sequential dependency via "再"', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search', 'code_generation'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索后再生成代码')

      expect(plan.strategy).toBe('serial')
    })

    it('detects sequential dependency via "then"', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search', 'visualization'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('search then visualization')

      expect(plan.strategy).toBe('serial')
    })

    it('deduplicates matched capabilities', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索 search 搜索')

      expect(plan.strategy).toBe('single')
      expect(plan.steps).toHaveLength(1)
    })

    it('passes options through to plan', async () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      const planner = new Planner({ hive })

      const plan = await planner.analyzePlan('搜索', {
        input: { q: 'test' },
        expectedOutput: '搜索结果',
        constraints: { timeout: 60 }
      })

      expect(plan.strategy).toBe('single')
    })
  })
})

describe('buildTasksFromPlan', () => {
  it('creates a TaskRecord from a plan', () => {
    const plan = {
      conversationId: 'conv_test_123',
      strategy: 'serial',
      steps: [
        { stepIndex: 0, capability: 'search', description: '搜索步骤' },
        { stepIndex: 1, capability: 'data_analysis', description: '分析步骤' }
      ]
    }

    const request = { description: '搜索然后分析', input: { q: 'test' } }
    const task = buildTasksFromPlan(plan, request)

    expect(task.taskId).toMatch(/^task_/)
    expect(task.conversationId).toBe('conv_test_123')
    expect(task.strategy).toBe('serial')
    expect(task.steps).toHaveLength(2)
    expect(task.status).toBe('pending')
    expect(task.request.description).toBe('搜索然后分析')
    expect(task.request.input).toEqual({ q: 'test' })
    expect(Object.isFrozen(task)).toBe(true)
  })

  it('includes expectedOutput and constraints when provided', () => {
    const plan = {
      conversationId: 'conv_1',
      strategy: 'single',
      steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
    }

    const task = buildTasksFromPlan(plan, {
      description: '搜索',
      input: {},
      expectedOutput: '结果列表',
      constraints: { timeout: 30 }
    })

    expect(task.request.expectedOutput).toBe('结果列表')
    expect(task.request.constraints).toEqual({ timeout: 30 })
  })
})
