/**
 * Feedback 数据模型单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  createFeedbackRecord,
  VALID_FEEDBACK_SOURCES
} from '../../src/models/feedback.js'
import { ValidationError } from '../../src/utils/errors.js'

describe('createFeedbackRecord', () => {
  const baseParams = {
    taskId: 'task_1712000000000_a3f8',
    conversationId: 'conv_1712000000000_b2c1',
    agentId: 'agent_1712000000000_d4e5',
    capability: 'search',
    source: 'auto',
    autoScore: 0.85,
    finalScore: 0.85
  }

  it('creates a valid FeedbackRecord with required fields', () => {
    const fb = createFeedbackRecord(baseParams)

    expect(fb.feedbackId).toMatch(/^fb_/)
    expect(fb.taskId).toBe(baseParams.taskId)
    expect(fb.conversationId).toBe(baseParams.conversationId)
    expect(fb.agentId).toBe(baseParams.agentId)
    expect(fb.capability).toBe('search')
    expect(fb.source).toBe('auto')
    expect(fb.autoScore).toBe(0.85)
    expect(fb.finalScore).toBe(0.85)
    expect(fb.createdAt).toBeTypeOf('number')
  })

  it('returns a frozen object', () => {
    const fb = createFeedbackRecord(baseParams)
    expect(Object.isFrozen(fb)).toBe(true)
  })

  it('creates user-sourced feedback with userScore', () => {
    const fb = createFeedbackRecord({
      ...baseParams,
      source: 'user',
      userScore: 4,
      userComment: '不错'
    })

    expect(fb.source).toBe('user')
    expect(fb.userScore).toBe(4)
    expect(fb.userComment).toBe('不错')
  })

  it('includes corrections when provided', () => {
    const corrections = [{ field: 'output', suggestion: '更详细些' }]
    const fb = createFeedbackRecord({
      ...baseParams,
      corrections
    })

    expect(fb.corrections).toEqual(corrections)
  })

  it('includes taskContext when provided', () => {
    const taskContext = { description: '搜索测试', strategy: 'single' }
    const fb = createFeedbackRecord({
      ...baseParams,
      taskContext
    })

    expect(fb.taskContext).toEqual(taskContext)
  })

  it('uses defaults for optional fields when not provided', () => {
    const fb = createFeedbackRecord({
      taskId: 'task_test',
      conversationId: 'conv_test',
      agentId: 'agent_test',
      capability: 'search',
      source: 'auto'
    })

    expect(fb.userScore).toBeUndefined()
    expect(fb.autoScore).toBeUndefined()
    expect(fb.finalScore).toBeUndefined()
  })

  it('throws ValidationError when taskId is missing', () => {
    expect(() => createFeedbackRecord({
      source: 'auto'
    })).toThrow(ValidationError)
  })

  it('throws ValidationError when conversationId is missing', () => {
    expect(() => createFeedbackRecord({
      taskId: 'task_test',
      source: 'auto'
    })).toThrow(ValidationError)
  })

  it('throws ValidationError when agentId is missing', () => {
    expect(() => createFeedbackRecord({
      taskId: 'task_test',
      conversationId: 'conv_test',
      source: 'auto'
    })).toThrow(ValidationError)
  })

  it('throws ValidationError when capability is missing', () => {
    expect(() => createFeedbackRecord({
      taskId: 'task_test',
      conversationId: 'conv_test',
      agentId: 'agent_test',
      source: 'auto'
    })).toThrow(ValidationError)
  })

  it('throws ValidationError for invalid source', () => {
    expect(() => createFeedbackRecord({
      ...baseParams,
      source: 'invalid'
    })).toThrow(ValidationError)
  })

  it('throws ValidationError when userScore is out of range', () => {
    expect(() => createFeedbackRecord({
      ...baseParams,
      source: 'user',
      userScore: 0
    })).toThrow(ValidationError)

    expect(() => createFeedbackRecord({
      ...baseParams,
      source: 'user',
      userScore: 6
    })).toThrow(ValidationError)
  })

  it('throws ValidationError when userScore is not integer', () => {
    expect(() => createFeedbackRecord({
      ...baseParams,
      source: 'user',
      userScore: 3.5
    })).toThrow(ValidationError)
  })

  it('throws ValidationError when autoScore is out of range', () => {
    expect(() => createFeedbackRecord({
      ...baseParams,
      autoScore: -0.1
    })).toThrow(ValidationError)

    expect(() => createFeedbackRecord({
      ...baseParams,
      autoScore: 1.1
    })).toThrow(ValidationError)
  })

  it('accepts valid autoScore boundary values', () => {
    const fbMin = createFeedbackRecord({ ...baseParams, autoScore: 0 })
    expect(fbMin.autoScore).toBe(0)

    const fbMax = createFeedbackRecord({ ...baseParams, autoScore: 1 })
    expect(fbMax.autoScore).toBe(1)
  })

  it('accepts valid userScore boundary values', () => {
    const fbMin = createFeedbackRecord({ ...baseParams, source: 'user', userScore: 1 })
    expect(fbMin.userScore).toBe(1)

    const fbMax = createFeedbackRecord({ ...baseParams, source: 'user', userScore: 5 })
    expect(fbMax.userScore).toBe(5)
  })

  it('VALID_FEEDBACK_SOURCES exports correct values', () => {
    expect(VALID_FEEDBACK_SOURCES).toEqual(['auto', 'user'])
  })
})
