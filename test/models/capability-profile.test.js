/**
 * CapabilityProfile 数据模型单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  createCapabilityProfile,
  emaUpdate,
  computeTrend,
  VALID_TRENDS
} from '../../src/models/capability-profile.js'
import { ValidationError } from '../../src/utils/errors.js'

describe('createCapabilityProfile', () => {
  const baseParams = {
    agentId: 'agent_001',
    capability: 'code_generation'
  }

  it('creates a profile with required fields and defaults', () => {
    const profile = createCapabilityProfile(baseParams)

    expect(profile.agentId).toBe('agent_001')
    expect(profile.capability).toBe('code_generation')
    expect(profile.declaredConfidence).toBe(0.5)
    expect(profile.actualScore).toBe(0.5)
    expect(profile.taskCount).toBe(0)
    expect(profile.successRate).toBe(0.5)
    expect(profile.avgDuration).toBe(0)
    expect(profile.specializations).toEqual({})
    expect(profile.recentTrend).toBe('stable')
    expect(profile.updatedAt).toBeTypeOf('number')
  })

  it('returns a frozen object', () => {
    const profile = createCapabilityProfile(baseParams)
    expect(Object.isFrozen(profile)).toBe(true)
  })

  it('creates a profile with all fields specified', () => {
    const profile = createCapabilityProfile({
      ...baseParams,
      declaredConfidence: 0.8,
      actualScore: 0.9,
      taskCount: 42,
      successRate: 0.85,
      avgDuration: 1500,
      specializations: { python: 0.9, javascript: 0.7 },
      recentTrend: 'improving',
      updatedAt: 1712000000000
    })

    expect(profile.declaredConfidence).toBe(0.8)
    expect(profile.actualScore).toBe(0.9)
    expect(profile.taskCount).toBe(42)
    expect(profile.successRate).toBe(0.85)
    expect(profile.avgDuration).toBe(1500)
    expect(profile.specializations).toEqual({ python: 0.9, javascript: 0.7 })
    expect(profile.recentTrend).toBe('improving')
    expect(profile.updatedAt).toBe(1712000000000)
  })

  it('throws ValidationError when agentId is missing', () => {
    expect(() => createCapabilityProfile({ capability: 'search' }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when capability is missing', () => {
    expect(() => createCapabilityProfile({ agentId: 'agent_001' }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when declaredConfidence is out of range', () => {
    expect(() => createCapabilityProfile({ ...baseParams, declaredConfidence: -0.1 }))
      .toThrow(ValidationError)
    expect(() => createCapabilityProfile({ ...baseParams, declaredConfidence: 1.1 }))
      .toThrow(ValidationError)
  })

  it('accepts declaredConfidence boundary values 0 and 1', () => {
    expect(() => createCapabilityProfile({ ...baseParams, declaredConfidence: 0 })).not.toThrow()
    expect(() => createCapabilityProfile({ ...baseParams, declaredConfidence: 1 })).not.toThrow()
  })

  it('throws ValidationError when actualScore is out of range', () => {
    expect(() => createCapabilityProfile({ ...baseParams, actualScore: -0.1 }))
      .toThrow(ValidationError)
    expect(() => createCapabilityProfile({ ...baseParams, actualScore: 1.5 }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when taskCount is negative', () => {
    expect(() => createCapabilityProfile({ ...baseParams, taskCount: -1 }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when taskCount is not an integer', () => {
    expect(() => createCapabilityProfile({ ...baseParams, taskCount: 1.5 }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when successRate is out of range', () => {
    expect(() => createCapabilityProfile({ ...baseParams, successRate: -0.1 }))
      .toThrow(ValidationError)
    expect(() => createCapabilityProfile({ ...baseParams, successRate: 1.1 }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError when avgDuration is negative', () => {
    expect(() => createCapabilityProfile({ ...baseParams, avgDuration: -100 }))
      .toThrow(ValidationError)
  })

  it('throws ValidationError for invalid recentTrend', () => {
    expect(() => createCapabilityProfile({ ...baseParams, recentTrend: 'unknown' }))
      .toThrow(ValidationError)
  })

  it('accepts all valid recentTrend values', () => {
    for (const trend of VALID_TRENDS) {
      expect(() => createCapabilityProfile({ ...baseParams, recentTrend: trend })).not.toThrow()
    }
  })

  it('VALID_TRENDS exports correct values', () => {
    expect(VALID_TRENDS).toEqual(['improving', 'stable', 'declining'])
  })
})

describe('emaUpdate', () => {
  it('computes EMA correctly with default alpha=0.1', () => {
    // EMA = 0.5 * 0.9 + 1.0 * 0.1 = 0.45 + 0.1 = 0.55
    const result = emaUpdate(0.5, 1.0)
    expect(result).toBeCloseTo(0.55, 10)
  })

  it('computes EMA correctly with custom alpha', () => {
    // EMA = 0.5 * 0.5 + 1.0 * 0.5 = 0.25 + 0.5 = 0.75
    const result = emaUpdate(0.5, 1.0, 0.5)
    expect(result).toBeCloseTo(0.75, 10)
  })

  it('clamps result to [0, 1]', () => {
    // Even with extreme values, should stay in range
    expect(emaUpdate(0, 0)).toBe(0)
    expect(emaUpdate(1, 1)).toBe(1)
  })

  it('gives more weight to current score with small alpha', () => {
    // With alpha=0.1, new score only contributes 10%
    const result = emaUpdate(0.9, 0.1, 0.1)
    expect(result).toBeCloseTo(0.82, 10)
  })

  it('gives more weight to new score with large alpha', () => {
    // With alpha=0.9, new score dominates
    const result = emaUpdate(0.9, 0.1, 0.9)
    expect(result).toBeCloseTo(0.18, 10)
  })

  it('converges toward new score over multiple updates', () => {
    let score = 0.5
    for (let i = 0; i < 50; i++) {
      score = emaUpdate(score, 1.0, 0.1)
    }
    // After 50 updates with score=1.0, should be very close to 1.0
    expect(score).toBeGreaterThan(0.99)
  })

  it('handles boundary values', () => {
    expect(emaUpdate(0.5, 0.0, 0.1)).toBeCloseTo(0.45, 10)
    expect(emaUpdate(0.5, 1.0, 0.1)).toBeCloseTo(0.55, 10)
    expect(emaUpdate(0.0, 1.0, 0.1)).toBeCloseTo(0.1, 10)
    expect(emaUpdate(1.0, 0.0, 0.1)).toBeCloseTo(0.9, 10)
  })
})

describe('computeTrend', () => {
  it('returns stable when insufficient data', () => {
    expect(computeTrend([])).toBe('stable')
    expect(computeTrend([0.5, 0.6, 0.7])).toBe('stable')
    expect(computeTrend(Array(9).fill(0.5))).toBe('stable')
  })

  it('returns stable when baseline has fewer than 3 data points', () => {
    // recentWindow=5, need at least 3 baseline points after window
    const scores = Array(7).fill(0.5) // 5 recent + 2 baseline (< 3)
    expect(computeTrend(scores, { recentWindow: 5 })).toBe('stable')
  })

  it('returns improving when recent scores are significantly higher', () => {
    // Build 50 scores: first 40 are 0.5, last 10 are 0.9
    const scores = [
      ...Array(40).fill(0.5),
      ...Array(10).fill(0.9)
    ]
    expect(computeTrend(scores)).toBe('improving')
  })

  it('returns declining when recent scores are significantly lower', () => {
    // Build 50 scores: first 40 are 0.9, last 10 are 0.3
    const scores = [
      ...Array(40).fill(0.9),
      ...Array(10).fill(0.3)
    ]
    expect(computeTrend(scores)).toBe('declining')
  })

  it('returns stable when difference is within threshold', () => {
    // Both windows around 0.5, difference < 0.05
    const scores = Array(50).fill(0.5)
    expect(computeTrend(scores)).toBe('stable')
  })

  it('respects custom threshold', () => {
    const scores = [
      ...Array(40).fill(0.5),
      ...Array(10).fill(0.58)
    ]
    // Default threshold 0.05: 0.58 - 0.5 = 0.08 > 0.05 -> improving
    expect(computeTrend(scores)).toBe('improving')

    // Threshold 0.1: 0.08 < 0.1 -> stable
    expect(computeTrend(scores, { threshold: 0.1 })).toBe('stable')
  })

  it('respects custom recentWindow', () => {
    // Only 15 scores, but recentWindow=3
    const scores = [
      ...Array(10).fill(0.3),
      ...Array(5).fill(0.9)
    ]
    expect(computeTrend(scores, { recentWindow: 3 })).toBe('improving')
  })

  it('uses the last recentWindow scores for recent calculation', () => {
    // 20 scores: first 10 at 0.3, next 5 at 0.6, last 5 at 0.9
    const scores = [
      ...Array(10).fill(0.3),
      ...Array(5).fill(0.6),
      ...Array(5).fill(0.9)
    ]
    // recentWindow=5 -> recent = [0.9]*5, baseline = [0.3]*10 + [0.6]*5
    const result = computeTrend(scores, { recentWindow: 5, baselineWindow: 20 })
    expect(result).toBe('improving')
  })
})
