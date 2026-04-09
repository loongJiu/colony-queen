import { describe, it, expect } from 'vitest'
import {
  createPlanCaseRecord,
  computeInputHash,
  VALID_PLAN_CASE_STATUSES
} from '../../src/models/plan-case.js'
import { ValidationError } from '../../src/utils/errors.js'

describe('computeInputHash', () => {
  it('returns a string hash for valid input', () => {
    const hash = computeInputHash('搜索最新的新闻')
    expect(hash).toBeTypeOf('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('is case-insensitive', () => {
    const h1 = computeInputHash('Search news')
    const h2 = computeInputHash('search NEWS')
    expect(h1).toBe(h2)
  })

  it('trims whitespace before hashing', () => {
    const h1 = computeInputHash('搜索')
    const h2 = computeInputHash('  搜索  ')
    expect(h1).toBe(h2)
  })

  it('throws ValidationError for empty string', () => {
    expect(() => computeInputHash('')).toThrow(ValidationError)
  })

  it('throws ValidationError for non-string input', () => {
    expect(() => computeInputHash(null)).toThrow(ValidationError)
    expect(() => computeInputHash(123)).toThrow(ValidationError)
  })
})

describe('createPlanCaseRecord', () => {
  const baseParams = {
    inputText: '搜索最新的AI新闻并生成摘要',
    plan: { strategy: 'serial', steps: [{ capability: 'search', description: '搜索' }, { capability: 'text_writing', description: '摘要' }] }
  }

  it('creates a valid PlanCaseRecord with required fields', () => {
    const record = createPlanCaseRecord(baseParams)

    expect(record.caseId).toMatch(/^pc_/)
    expect(record.inputHash).toBe(computeInputHash(baseParams.inputText))
    expect(record.inputText).toBe(baseParams.inputText)
    expect(record.plan).toBeTypeOf('string')
    expect(record.score).toBe(0)
    expect(record.usedCount).toBe(0)
    expect(record.status).toBe('pending')
    expect(record.createdAt).toBeTypeOf('number')
    expect(record.updatedAt).toBe(record.createdAt)
  })

  it('returns a frozen object', () => {
    const record = createPlanCaseRecord(baseParams)
    expect(Object.isFrozen(record)).toBe(true)
  })

  it('serializes plan object to JSON string', () => {
    const record = createPlanCaseRecord(baseParams)
    const parsed = JSON.parse(record.plan)
    expect(parsed.strategy).toBe('serial')
    expect(parsed.steps).toHaveLength(2)
  })

  it('accepts pre-serialized plan string', () => {
    const planStr = JSON.stringify(baseParams.plan)
    const record = createPlanCaseRecord({ ...baseParams, plan: planStr })
    expect(record.plan).toBe(planStr)
  })

  it('accepts custom score, usedCount, status', () => {
    const record = createPlanCaseRecord({
      ...baseParams,
      score: 0.85,
      usedCount: 3,
      status: 'confirmed'
    })

    expect(record.score).toBe(0.85)
    expect(record.usedCount).toBe(3)
    expect(record.status).toBe('confirmed')
  })

  it('throws ValidationError when inputText is missing', () => {
    expect(() => createPlanCaseRecord({ plan: {} })).toThrow(ValidationError)
  })

  it('throws ValidationError when inputText is empty', () => {
    expect(() => createPlanCaseRecord({ inputText: '', plan: {} })).toThrow(ValidationError)
  })

  it('throws ValidationError when plan is missing', () => {
    expect(() => createPlanCaseRecord({ inputText: 'test' })).toThrow(ValidationError)
  })

  it('throws ValidationError when plan is null', () => {
    expect(() => createPlanCaseRecord({ inputText: 'test', plan: null })).toThrow(ValidationError)
  })

  it('throws ValidationError for invalid score', () => {
    expect(() => createPlanCaseRecord({ ...baseParams, score: -0.1 })).toThrow(ValidationError)
    expect(() => createPlanCaseRecord({ ...baseParams, score: 1.5 })).toThrow(ValidationError)
    expect(() => createPlanCaseRecord({ ...baseParams, score: 'bad' })).toThrow(ValidationError)
  })

  it('throws ValidationError for invalid usedCount', () => {
    expect(() => createPlanCaseRecord({ ...baseParams, usedCount: -1 })).toThrow(ValidationError)
    expect(() => createPlanCaseRecord({ ...baseParams, usedCount: 1.5 })).toThrow(ValidationError)
  })

  it('throws ValidationError for invalid status', () => {
    expect(() => createPlanCaseRecord({ ...baseParams, status: 'invalid' })).toThrow(ValidationError)
  })

  it('accepts score boundary values 0 and 1', () => {
    const r0 = createPlanCaseRecord({ ...baseParams, score: 0 })
    expect(r0.score).toBe(0)

    const r1 = createPlanCaseRecord({ ...baseParams, score: 1 })
    expect(r1.score).toBe(1)
  })

  it('VALID_PLAN_CASE_STATUSES exports correct values', () => {
    expect(VALID_PLAN_CASE_STATUSES).toEqual(['pending', 'confirmed', 'discarded'])
  })
})
