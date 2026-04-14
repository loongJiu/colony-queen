import { describe, it, expect } from 'vitest'
import { createMessageRecord, VALID_TYPES, VALID_PRIORITIES } from '../../src/models/message.js'
import { ValidationError } from '../../src/utils/errors.js'

describe('createMessageRecord', () => {
  it('creates a record with all required fields', () => {
    const msg = createMessageRecord({
      type: 'task_assign',
      from: 'queen',
      payload: { task: 'do something' }
    })

    expect(msg.type).toBe('task_assign')
    expect(msg.from).toBe('queen')
    expect(msg.payload).toEqual({ task: 'do something' })
    expect(msg.messageId).toMatch(/^msg_\d+_[a-z0-9]+$/)
    expect(msg.createdAt).toBeTypeOf('number')
  })

  it('applies correct defaults', () => {
    const msg = createMessageRecord({
      type: 'heartbeat',
      from: 'agent_1',
      payload: null
    })

    expect(msg.priority).toBe(5)
    expect(msg.ttl).toBe(30000)
  })

  it('includes optional fields when provided', () => {
    const msg = createMessageRecord({
      type: 'task_result',
      from: 'agent_1',
      payload: { output: 'done' },
      to: 'agent_2',
      priority: 1,
      ttl: 5000,
      correlationId: 'corr_123'
    })

    expect(msg.to).toBe('agent_2')
    expect(msg.priority).toBe(1)
    expect(msg.ttl).toBe(5000)
    expect(msg.correlationId).toBe('corr_123')
  })

  it('omits optional fields when not provided', () => {
    const msg = createMessageRecord({
      type: 'command',
      from: 'queen',
      payload: {}
    })

    expect(msg).not.toHaveProperty('to')
    expect(msg).not.toHaveProperty('correlationId')
  })

  it('returns a frozen immutable object', () => {
    const msg = createMessageRecord({
      type: 'event',
      from: 'queen',
      payload: {}
    })

    expect(Object.isFrozen(msg)).toBe(true)
    expect(() => { msg.type = 'other' }).toThrow()
    expect(() => { msg.payload = 'new' }).toThrow()
  })

  it('generates unique messageIds', () => {
    const a = createMessageRecord({ type: 'event', from: 'queen', payload: {} })
    const b = createMessageRecord({ type: 'event', from: 'queen', payload: {} })

    expect(a.messageId).not.toBe(b.messageId)
  })

  it('accepts all valid types', () => {
    for (const type of VALID_TYPES) {
      const msg = createMessageRecord({ type, from: 'queen', payload: null })
      expect(msg.type).toBe(type)
    }
  })

  it('accepts all valid priorities', () => {
    for (const p of VALID_PRIORITIES) {
      const msg = createMessageRecord({ type: 'event', from: 'queen', payload: null, priority: p })
      expect(msg.priority).toBe(p)
    }
  })

  it('accepts ttl=0 (never expires)', () => {
    const msg = createMessageRecord({ type: 'event', from: 'queen', payload: null, ttl: 0 })
    expect(msg.ttl).toBe(0)
  })

  it('accepts negative ttl', () => {
    const msg = createMessageRecord({ type: 'event', from: 'queen', payload: null, ttl: -1 })
    expect(msg.ttl).toBe(-1)
  })

  it('throws ValidationError for invalid type', () => {
    expect(() =>
      createMessageRecord({ type: 'invalid', from: 'queen', payload: null })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError for undefined type', () => {
    expect(() =>
      createMessageRecord({ type: undefined, from: 'queen', payload: null })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError for priority out of range (0)', () => {
    expect(() =>
      createMessageRecord({ type: 'event', from: 'queen', payload: null, priority: 0 })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError for priority out of range (6)', () => {
    expect(() =>
      createMessageRecord({ type: 'event', from: 'queen', payload: null, priority: 6 })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError for negative priority', () => {
    expect(() =>
      createMessageRecord({ type: 'event', from: 'queen', payload: null, priority: -1 })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError for float priority', () => {
    expect(() =>
      createMessageRecord({ type: 'event', from: 'queen', payload: null, priority: 3.5 })
    ).toThrow(ValidationError)
  })
})

describe('exports', () => {
  it('exports VALID_TYPES with expected values', () => {
    expect(VALID_TYPES).toEqual(['task_assign', 'task_cancel', 'task_result', 'heartbeat', 'command', 'event'])
  })

  it('exports VALID_PRIORITIES with expected values', () => {
    expect(VALID_PRIORITIES).toEqual([1, 2, 3, 4, 5])
  })
})
