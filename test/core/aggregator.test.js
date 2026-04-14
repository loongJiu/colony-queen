import { describe, it, expect } from 'vitest'
import { merge } from '../../src/core/aggregator.js'
import { createStepResult } from '../../src/models/task.js'

function makeTask(overrides = {}) {
  return {
    taskId: 'task_test',
    conversationId: 'conv_test',
    strategy: overrides.strategy ?? 'single',
    request: { description: '测试任务' },
    steps: [],
    status: 'success',
    results: overrides.results ?? [],
    startedAt: overrides.startedAt ?? Date.now() - 1000,
    finishedAt: overrides.finishedAt ?? Date.now(),
    createdAt: Date.now() - 2000
  }
}

describe('merge', () => {
  it('returns failure for empty results', () => {
    const task = makeTask({ results: [] })
    const merged = merge(task)

    expect(merged.status).toBe('failure')
    expect(merged.output).toBeNull()
    expect(merged.summary).toBe('No results')
  })

  describe('single strategy', () => {
    it('returns success output from single result', () => {
      const result = createStepResult({
        stepIndex: 0,
        agentId: 'agent_1',
        status: 'success',
        output: { answer: 42 },
        summary: '完成',
        startedAt: Date.now() - 100,
        finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'single', results: [result] })
      const merged = merge(task)

      expect(merged.status).toBe('success')
      expect(merged.output).toEqual({ answer: 42 })
    })

    it('returns failure from single failed result', () => {
      const result = createStepResult({
        stepIndex: 0,
        agentId: 'agent_1',
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
        startedAt: Date.now() - 100,
        finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'single', results: [result] })
      const merged = merge(task)

      expect(merged.status).toBe('failure')
      expect(merged.output).toBeNull()
    })
  })

  describe('serial strategy', () => {
    it('returns last step output on full success', () => {
      const r0 = createStepResult({
        stepIndex: 0, agentId: 'agent_1', status: 'success',
        output: { search: 'found' }, summary: '搜索完成',
        usage: { input_tokens: 10, output_tokens: 5 },
        startedAt: Date.now() - 200, finishedAt: Date.now() - 100
      })
      const r1 = createStepResult({
        stepIndex: 1, agentId: 'agent_2', status: 'success',
        output: { analysis: 'done' }, summary: '分析完成',
        usage: { input_tokens: 20, output_tokens: 15 },
        startedAt: Date.now() - 100, finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'serial', results: [r0, r1] })
      const merged = merge(task)

      expect(merged.status).toBe('success')
      expect(merged.output).toEqual({ analysis: 'done' })
      expect(merged.usage.input_tokens).toBe(30)
      expect(merged.usage.output_tokens).toBe(20)
    })

    it('returns partial when some steps succeed and some fail', () => {
      const r0 = createStepResult({
        stepIndex: 0, agentId: 'agent_1', status: 'success',
        output: 'a', startedAt: Date.now() - 100, finishedAt: Date.now()
      })
      const r1 = createStepResult({
        stepIndex: 1, agentId: 'agent_2', status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
        startedAt: Date.now() - 100, finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'serial', results: [r0, r1] })
      const merged = merge(task)

      expect(merged.status).toBe('partial')
    })

    it('returns failure when all steps fail', () => {
      const r0 = createStepResult({
        stepIndex: 0, agentId: 'agent_1', status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
        startedAt: Date.now() - 100, finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'serial', results: [r0] })
      const merged = merge(task)

      expect(merged.status).toBe('failure')
    })
  })

  describe('parallel strategy', () => {
    it('returns array of all outputs when all succeed', () => {
      const r0 = createStepResult({
        stepIndex: 0, agentId: 'agent_1', status: 'success',
        output: { a: 1 }, startedAt: Date.now() - 100, finishedAt: Date.now()
      })
      const r1 = createStepResult({
        stepIndex: 1, agentId: 'agent_2', status: 'success',
        output: { b: 2 }, startedAt: Date.now() - 100, finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'parallel', results: [r0, r1] })
      const merged = merge(task)

      expect(merged.status).toBe('success')
      expect(merged.output).toEqual([{ a: 1 }, { b: 2 }])
    })

    it('returns partial when some steps fail', () => {
      const r0 = createStepResult({
        stepIndex: 0, agentId: 'agent_1', status: 'success',
        output: { a: 1 }, startedAt: Date.now() - 100, finishedAt: Date.now()
      })
      const r1 = createStepResult({
        stepIndex: 1, agentId: 'agent_2', status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
        startedAt: Date.now() - 100, finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'parallel', results: [r0, r1] })
      const merged = merge(task)

      expect(merged.status).toBe('partial')
      expect(merged.output).toEqual([{ a: 1 }])
    })

    it('returns failure when all steps fail', () => {
      const r0 = createStepResult({
        stepIndex: 0, agentId: 'agent_1', status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
        startedAt: Date.now() - 100, finishedAt: Date.now()
      })
      const r1 = createStepResult({
        stepIndex: 1, agentId: 'agent_2', status: 'failure',
        error: { code: 'ERR_UNKNOWN', message: 'error', retryable: true },
        startedAt: Date.now() - 100, finishedAt: Date.now()
      })

      const task = makeTask({ strategy: 'parallel', results: [r0, r1] })
      const merged = merge(task)

      expect(merged.status).toBe('failure')
      expect(merged.output).toEqual([])
    })
  })

  it('collects artifacts from all results', () => {
    const r0 = createStepResult({
      stepIndex: 0, agentId: 'agent_1', status: 'success',
      output: 'a', artifacts: [{ type: 'file', name: 'a.txt' }],
      startedAt: Date.now() - 100, finishedAt: Date.now()
    })
    const r1 = createStepResult({
      stepIndex: 1, agentId: 'agent_2', status: 'success',
      output: 'b', artifacts: [{ type: 'file', name: 'b.txt' }],
      startedAt: Date.now() - 100, finishedAt: Date.now()
    })

    const task = makeTask({ strategy: 'parallel', results: [r0, r1] })
    const merged = merge(task)

    expect(merged.artifacts).toHaveLength(2)
  })

  it('joins summaries from all results', () => {
    const r0 = createStepResult({
      stepIndex: 0, agentId: 'agent_1', status: 'success',
      output: 'a', summary: '步骤1完成',
      startedAt: Date.now() - 100, finishedAt: Date.now()
    })
    const r1 = createStepResult({
      stepIndex: 1, agentId: 'agent_2', status: 'success',
      output: 'b', summary: '步骤2完成',
      startedAt: Date.now() - 100, finishedAt: Date.now()
    })

    const task = makeTask({ strategy: 'serial', results: [r0, r1] })
    const merged = merge(task)

    expect(merged.summary).toBe('步骤1完成; 步骤2完成')
  })

  it('calculates total_latency_ms from startedAt/finishedAt', () => {
    const startedAt = Date.now() - 5000
    const finishedAt = Date.now()
    const r = createStepResult({
      stepIndex: 0, agentId: 'agent_1', status: 'success',
      output: 'a', startedAt, finishedAt
    })

    const task = makeTask({ strategy: 'single', results: [r], startedAt, finishedAt })
    const merged = merge(task)

    expect(merged.usage.total_latency_ms).toBeGreaterThanOrEqual(4000)
  })

  it('returns default summary when no summaries present', () => {
    const r = createStepResult({
      stepIndex: 0, agentId: 'agent_1', status: 'success',
      output: 'a',
      startedAt: Date.now() - 100, finishedAt: Date.now()
    })

    const task = makeTask({ strategy: 'single', results: [r] })
    const merged = merge(task)

    expect(merged.summary).toContain('Completed 1 step')
  })
})
