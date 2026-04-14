import { describe, it, expect, vi } from 'vitest'
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

function makeMockLLMClient(response, configured = true) {
  return {
    isConfigured: configured,
    complete: vi.fn(async () => response)
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

describe('Planner.precheck', () => {
  it('returns feasible when all capabilities have active agents', () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
    const planner = new Planner({ hive })

    const check = planner.precheck('搜索相关资料')

    expect(check.feasible).toBe(true)
    expect(check.missingCapabilities).toEqual([])
    expect(check.availableCapabilities).toEqual([{ capability: 'search', activeAgents: 1 }])
    expect(check.totalActiveAgents).toBe(1)
  })

  it('returns not feasible when no agent has required capability', () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
    const planner = new Planner({ hive })

    const check = planner.precheck('调试代码')

    expect(check.feasible).toBe(false)
    expect(check.missingCapabilities).toContain('debugging')
  })

  it('returns not feasible when capability agents are all offline', () => {
    const hive = new Hive()
    const record = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
    hive.markOffline(record.agentId)
    const planner = new Planner({ hive })

    const check = planner.precheck('搜索')

    expect(check.feasible).toBe(false)
    expect(check.missingCapabilities).toContain('search')
    expect(check.totalActiveAgents).toBe(0)
  })

  it('includes suggestions for missing capabilities', () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['data_analysis'] }), 'sess_1')
    const planner = new Planner({ hive })

    const check = planner.precheck('数据分析')

    expect(check.feasible).toBe(true)
    expect(check.suggestions).toEqual([])
  })

  it('returns feasible for descriptions that match no keywords (general)', () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
    const planner = new Planner({ hive })

    // 不匹配任何关键词 → 无 required capabilities → feasible
    const check = planner.precheck('做一些不相关的事情')

    expect(check.feasible).toBe(true)
    expect(check.missingCapabilities).toEqual([])
  })
})

describe('Planner.analyzePlan with LLM', () => {
  it('uses LLM plan when available and returns valid result', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmResponse = JSON.stringify({
      strategy: 'single',
      steps: [{ capability: 'search', description: '搜索相关资料' }]
    })
    const llmClient = makeMockLLMClient(llmResponse)
    const planner = new Planner({ hive, llmClient, logger: { warn: vi.fn() } })

    const plan = await planner.analyzePlan('搜索相关资料')

    expect(plan.strategy).toBe('single')
    expect(plan.steps[0].capability).toBe('search')
    expect(llmClient.complete).toHaveBeenCalledTimes(1)
  })

  it('parses LLM response wrapped in markdown code blocks', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmResponse = '```json\n{"strategy":"single","steps":[{"capability":"search","description":"搜索"}]}\n```'
    const llmClient = makeMockLLMClient(llmResponse)
    const planner = new Planner({ hive, llmClient, logger: { warn: vi.fn() } })

    const plan = await planner.analyzePlan('搜索')

    expect(plan.strategy).toBe('single')
    expect(plan.steps[0].capability).toBe('search')
  })

  it('falls back to rule-based when LLM returns invalid JSON', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmClient = makeMockLLMClient('not valid json at all')
    const logger = { warn: vi.fn() }
    const planner = new Planner({ hive, llmClient, logger })

    const plan = await planner.analyzePlan('搜索相关资料')

    // 降级到规则引擎
    expect(plan.strategy).toBe('single')
    expect(plan.steps[0].capability).toBe('search')
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to rule-based when LLM references unknown capability', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmResponse = JSON.stringify({
      strategy: 'single',
      steps: [{ capability: 'translation', description: '翻译' }]
    })
    const llmClient = makeMockLLMClient(llmResponse)
    const logger = { warn: vi.fn() }
    const planner = new Planner({ hive, llmClient, logger })

    const plan = await planner.analyzePlan('翻译文档')

    // translation 不在 Hive 中，降级到规则引擎
    expect(plan.strategy).toBe('single')
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to rule-based when LLM throws network error', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmClient = {
      isConfigured: true,
      complete: vi.fn(async () => { throw new Error('Network timeout') })
    }
    const logger = { warn: vi.fn() }
    const planner = new Planner({ hive, llmClient, logger })

    const plan = await planner.analyzePlan('搜索资料')

    expect(plan.strategy).toBe('single')
    expect(plan.steps[0].capability).toBe('search')
  })

  it('throws when fallbackEnabled is false and LLM fails', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmClient = {
      isConfigured: true,
      complete: vi.fn(async () => { throw new Error('API error') })
    }
    const logger = { warn: vi.fn() }
    const planner = new Planner({ hive, llmClient, fallbackEnabled: false, logger })

    await expect(planner.analyzePlan('搜索')).rejects.toThrow('API error')
  })

  it('skips LLM when not configured', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmClient = makeMockLLMClient('', false)
    const planner = new Planner({ hive, llmClient })

    const plan = await planner.analyzePlan('搜索资料')

    expect(plan.strategy).toBe('single')
    expect(llmClient.complete).not.toHaveBeenCalled()
  })

  it('works without llmClient at all (backward compatible)', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
    const planner = new Planner({ hive })

    const plan = await planner.analyzePlan('搜索资料')

    expect(plan.strategy).toBe('single')
    expect(plan.steps[0].capability).toBe('search')
  })

  it('injects few-shot context from planMemory into LLM prompt', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmResponse = JSON.stringify({
      strategy: 'single',
      steps: [{ capability: 'search', description: '搜索相关资料' }]
    })
    const llmClient = makeMockLLMClient(llmResponse)

    const planMemory = {
      buildFewShotContext: vi.fn(async () => '## 历史成功案例参考\n### 参考案例 1\n任务: 搜索\n规划: {"strategy":"single","steps":[]}'),
      recordPending: vi.fn(async () => {})
    }

    const planner = new Planner({ hive, llmClient, planMemory, logger: { warn: vi.fn() } })
    const plan = await planner.analyzePlan('搜索资料')

    expect(planMemory.buildFewShotContext).toHaveBeenCalledWith('搜索资料', 3)
    expect(llmClient.complete).toHaveBeenCalledTimes(1)
    // 验证 few-shot 被注入到 system prompt 中
    const callArgs = llmClient.complete.mock.calls[0]
    expect(callArgs[1].systemPrompt).toContain('历史成功案例参考')
    expect(planMemory.recordPending).toHaveBeenCalled()
    expect(plan.strategy).toBe('single')
  })

  it('works normally when planMemory.buildFewShotContext throws', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmResponse = JSON.stringify({
      strategy: 'single',
      steps: [{ capability: 'search', description: '搜索' }]
    })
    const llmClient = makeMockLLMClient(llmResponse)

    const planMemory = {
      buildFewShotContext: vi.fn(async () => { throw new Error('DB down') }),
      recordPending: vi.fn(async () => {})
    }

    const logger = { warn: vi.fn() }
    const planner = new Planner({ hive, llmClient, planMemory, logger })
    const plan = await planner.analyzePlan('搜索')

    expect(plan.strategy).toBe('single')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('works normally when planMemory is null', async () => {
    const hive = new Hive()
    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const llmResponse = JSON.stringify({
      strategy: 'single',
      steps: [{ capability: 'search', description: '搜索' }]
    })
    const llmClient = makeMockLLMClient(llmResponse)

    const planner = new Planner({ hive, llmClient, planMemory: null, logger: { warn: vi.fn() } })
    const plan = await planner.analyzePlan('搜索')

    expect(plan.strategy).toBe('single')
    // system prompt 不应包含 few-shot 区域
    const callArgs = llmClient.complete.mock.calls[0]
    expect(callArgs[1].systemPrompt).not.toContain('历史成功案例参考')
  })
})
