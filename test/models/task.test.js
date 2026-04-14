import { describe, it, expect } from 'vitest'
import {
  createTaskRecord,
  createStepResult,
  VALID_TASK_STATUSES,
  VALID_STRATEGIES
} from '../../src/models/task.js'
import { ValidationError } from '../../src/utils/errors.js'

describe('createTaskRecord', () => {
  it('creates a valid TaskRecord with required fields', () => {
    const task = createTaskRecord({
      strategy: 'single',
      request: { description: '搜索任务', input: { q: 'test' } },
      steps: [{ stepIndex: 0, capability: 'search', description: '搜索步骤' }]
    })

    expect(task.taskId).toMatch(/^task_/)
    expect(task.conversationId).toMatch(/^task_/) // genTaskId fallback
    expect(task.strategy).toBe('single')
    expect(task.status).toBe('pending')
    expect(task.results).toEqual([])
    expect(task.steps).toHaveLength(1)
    expect(task.createdAt).toBeTypeOf('number')
  })

  it('uses provided conversationId', () => {
    const task = createTaskRecord({
      conversationId: 'conv_test_1234',
      strategy: 'serial',
      request: { description: '任务' },
      steps: []
    })
    expect(task.conversationId).toBe('conv_test_1234')
  })

  it('accepts optional parentTaskId', () => {
    const task = createTaskRecord({
      parentTaskId: 'task_parent_001',
      strategy: 'single',
      request: { description: '子任务' },
      steps: []
    })
    expect(task.parentTaskId).toBe('task_parent_001')
  })

  it('returns a frozen object', () => {
    const task = createTaskRecord({
      strategy: 'single',
      request: { description: '任务' },
      steps: []
    })
    expect(Object.isFrozen(task)).toBe(true)
  })

  it('throws ValidationError when description is missing', () => {
    expect(() => createTaskRecord({
      strategy: 'single',
      request: {},
      steps: []
    })).toThrow(ValidationError)
  })

  it('throws ValidationError for invalid strategy', () => {
    expect(() => createTaskRecord({
      strategy: 'invalid',
      request: { description: '任务' },
      steps: []
    })).toThrow(ValidationError)
  })

  it('normalizes step stepIndex from array index when not provided', () => {
    const task = createTaskRecord({
      strategy: 'serial',
      request: { description: '任务' },
      steps: [
        { capability: 'search', description: '搜索' },
        { capability: 'data_analysis', description: '分析' }
      ]
    })
    expect(task.steps[0].stepIndex).toBe(0)
    expect(task.steps[1].stepIndex).toBe(1)
  })

  it('VALID_STRATEGIES exports correct values', () => {
    expect(VALID_STRATEGIES).toEqual(['single', 'serial', 'parallel'])
  })

  it('VALID_TASK_STATUSES exports correct values', () => {
    expect(VALID_TASK_STATUSES).toContain('pending')
    expect(VALID_TASK_STATUSES).toContain('running')
    expect(VALID_TASK_STATUSES).toContain('success')
    expect(VALID_TASK_STATUSES).toContain('failure')
    expect(VALID_TASK_STATUSES).toContain('partial')
    expect(VALID_TASK_STATUSES).toContain('cancelled')
  })
})

describe('createStepResult', () => {
  it('creates a valid StepResult', () => {
    const now = Date.now()
    const result = createStepResult({
      stepIndex: 0,
      agentId: 'agent_test_001',
      status: 'success',
      output: { data: 'result' },
      summary: '搜索完成',
      usage: { input_tokens: 10, output_tokens: 5 },
      startedAt: now,
      finishedAt: now + 100
    })

    expect(result.stepIndex).toBe(0)
    expect(result.agentId).toBe('agent_test_001')
    expect(result.status).toBe('success')
    expect(result.output).toEqual({ data: 'result' })
    expect(result.summary).toBe('搜索完成')
    expect(result.usage.input_tokens).toBe(10)
    expect(result.finishedAt).toBe(now + 100)
  })

  it('returns a frozen object', () => {
    const result = createStepResult({
      stepIndex: 0,
      agentId: 'agent_x',
      status: 'failure',
      error: { code: 'ERR_TIMEOUT', message: 'timeout', retryable: true },
      startedAt: Date.now()
    })
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('omits undefined optional fields', () => {
    const result = createStepResult({
      stepIndex: 1,
      agentId: 'agent_x',
      status: 'failure',
      startedAt: Date.now()
    })
    expect(result.output).toBeUndefined()
    expect(result.summary).toBeUndefined()
    expect(result.artifacts).toBeUndefined()
  })
})
