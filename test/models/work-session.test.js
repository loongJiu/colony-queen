import { describe, it, expect } from 'vitest'
import {
  createWorkSessionRecord,
  VALID_SESSION_STATUSES
} from '../../src/models/work-session.js'
import { ValidationError } from '../../src/utils/errors.js'

describe('createWorkSessionRecord', () => {
  it('creates a valid WorkSessionRecord with required fields', () => {
    const session = createWorkSessionRecord({ title: '竞品分析项目' })

    expect(session.sessionId).toMatch(/^wsess_/)
    expect(session.title).toBe('竞品分析项目')
    expect(session.conversationIds).toEqual([])
    expect(session.keyOutputs).toEqual({})
    expect(session.sharedContext).toEqual({})
    expect(session.status).toBe('active')
    expect(session.createdAt).toBeTypeOf('number')
    expect(session.updatedAt).toBeTypeOf('number')
  })

  it('returns a frozen object', () => {
    const session = createWorkSessionRecord({ title: 'test' })
    expect(Object.isFrozen(session)).toBe(true)
  })

  it('accepts custom sessionId', () => {
    const session = createWorkSessionRecord({
      sessionId: 'wsess_custom_001',
      title: 'test'
    })
    expect(session.sessionId).toBe('wsess_custom_001')
  })

  it('accepts initial conversationIds', () => {
    const session = createWorkSessionRecord({
      title: 'test',
      conversationIds: ['conv_001', 'conv_002']
    })
    expect(session.conversationIds).toEqual(['conv_001', 'conv_002'])
  })

  it('accepts initial keyOutputs', () => {
    const keyOutputs = { conv_001: { type: 'output', summary: '搜索结果' } }
    const session = createWorkSessionRecord({ title: 'test', keyOutputs })
    expect(session.keyOutputs).toEqual(keyOutputs)
  })

  it('accepts initial sharedContext', () => {
    const sharedContext = { project: 'alpha', goal: '竞品分析' }
    const session = createWorkSessionRecord({ title: 'test', sharedContext })
    expect(session.sharedContext).toEqual(sharedContext)
  })

  it('accepts archived status', () => {
    const session = createWorkSessionRecord({ title: 'test', status: 'archived' })
    expect(session.status).toBe('archived')
  })

  it('sets createdAt equal to updatedAt on creation', () => {
    const session = createWorkSessionRecord({ title: 'test' })
    expect(session.createdAt).toBe(session.updatedAt)
  })

  it('throws ValidationError when title is missing', () => {
    expect(() => createWorkSessionRecord({})).toThrow(ValidationError)
  })

  it('throws ValidationError when title is empty string', () => {
    expect(() => createWorkSessionRecord({ title: '' })).toThrow(ValidationError)
  })

  it('throws ValidationError when title is non-string', () => {
    expect(() => createWorkSessionRecord({ title: 123 })).toThrow(ValidationError)
  })

  it('throws ValidationError for invalid status', () => {
    expect(() => createWorkSessionRecord({ title: 'test', status: 'invalid' })).toThrow(ValidationError)
  })

  it('does not mutate the input conversationIds array', () => {
    const original = ['conv_001']
    const session = createWorkSessionRecord({ title: 'test', conversationIds: original })
    original.push('conv_002')
    expect(session.conversationIds).toEqual(['conv_001'])
  })

  it('VALID_SESSION_STATUSES exports correct values', () => {
    expect(VALID_SESSION_STATUSES).toEqual(['active', 'archived'])
  })
})
