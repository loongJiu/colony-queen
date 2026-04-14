import { describe, it, expect } from 'vitest'
import { createAgentRecord } from '../../src/models/agent.js'
import { ValidationError } from '../../src/utils/errors.js'

/** @type {import('../../src/models/agent.js').AgentRecord} */
const VALID_SPEC = {
  identity: {
    id: 'worker_coder_01',
    role: 'worker',
    name: 'Coder',
    description: 'Code generation agent'
  },
  runtime: { endpoint: 'http://localhost:4001' },
  capabilities: ['code_generation', 'debugging'],
  model: { provider: 'openai', name: 'gpt-4' },
  tools: [{ id: 'code_executor' }, { id: 'file_reader' }],
  skills: [{ id: 'code_review', description: 'Review code' }],
  constraints: { max_concurrent: 3 }
}

describe('createAgentRecord', () => {
  it('creates a record with all fields from a valid spec', () => {
    const record = createAgentRecord(VALID_SPEC, 'sess_test123')

    expect(record.role).toBe('worker')
    expect(record.name).toBe('Coder')
    expect(record.description).toBe('Code generation agent')
    expect(record.endpoint).toBe('http://localhost:4001')
    expect(record.capabilities).toEqual(['code_generation', 'debugging'])
    expect(record.model).toEqual({ provider: 'openai', name: 'gpt-4' })
    expect(record.toolIds).toEqual(['code_executor', 'file_reader'])
    expect(record.skillIds).toEqual(['code_review'])
    expect(record.sessionToken).toBe('sess_test123')
    expect(record.agentId).toMatch(/^agent_\d+_[a-z0-9]+$/)
  })

  it('applies correct defaults', () => {
    const record = createAgentRecord(VALID_SPEC, 'sess_test')

    expect(record.status).toBe('idle')
    expect(record.load).toBe(0)
    expect(record.activeTasks).toBe(0)
    expect(record.queueDepth).toBe(0)
    expect(record.joinedAt).toBeTypeOf('number')
    expect(record.lastHeartbeat).toBe(record.joinedAt)
  })

  it('applies constraint defaults with partial override', () => {
    const record = createAgentRecord(VALID_SPEC, 'sess_test')

    expect(record.constraints.max_concurrent).toBe(3) // from spec
    expect(record.constraints.timeout_default).toBe(30) // default
    expect(record.constraints.queue_max).toBe(100) // default
    expect(record.constraints.retry_max).toBe(3) // default
  })

  it('applies full constraint defaults when spec has none', () => {
    const minimal = { identity: { role: 'worker' } }
    const record = createAgentRecord(minimal, 'sess_test')

    expect(record.constraints).toEqual({
      max_concurrent: 1,
      timeout_default: 30,
      queue_max: 100,
      retry_max: 3
    })
  })

  it('returns a frozen immutable object', () => {
    const record = createAgentRecord(VALID_SPEC, 'sess_test')

    expect(Object.isFrozen(record)).toBe(true)

    expect(() => { record.status = 'busy' }).toThrow()
    expect(() => { record.load = 0.5 }).toThrow()
    expect(record.status).toBe('idle')
    expect(record.load).toBe(0)
  })

  it('throws ValidationError when identity is missing', () => {
    expect(() => createAgentRecord({}, 'sess_test'))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when role is invalid', () => {
    expect(() =>
      createAgentRecord({ identity: { role: 'drone' } }, 'sess_test')
    ).toThrow(ValidationError)
  })

  it('includes specVersion when present', () => {
    const spec = { ...VALID_SPEC, specVersion: '1.0.0' }
    const record = createAgentRecord(spec, 'sess_test')

    expect(record.specVersion).toBe('1.0.0')
  })

  it('omits specVersion when absent', () => {
    const record = createAgentRecord(VALID_SPEC, 'sess_test')

    expect(record).not.toHaveProperty('specVersion')
  })

  it('handles minimal spec with only role', () => {
    const record = createAgentRecord(
      { identity: { role: 'scout' } },
      'sess_test'
    )

    expect(record.role).toBe('scout')
    expect(record.name).toBe('')
    expect(record.capabilities).toEqual([])
    expect(record.tags).toEqual([])
    expect(record.toolIds).toEqual([])
    expect(record.skillIds).toEqual([])
    expect(record.endpoint).toBe('')
  })

  it('generates unique agentIds', () => {
    const a = createAgentRecord(VALID_SPEC, 'sess_1')
    const b = createAgentRecord(VALID_SPEC, 'sess_2')

    expect(a.agentId).not.toBe(b.agentId)
  })
})
