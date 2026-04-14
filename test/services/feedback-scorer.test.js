/**
 * FeedbackScorer 反馈自动评分算法单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { FeedbackScorer } from '../../src/services/feedback-scorer.js'

function makeTask(overrides = {}) {
  return {
    taskId: 'task_test_001',
    conversationId: 'conv_test_001',
    strategy: 'single',
    status: 'success',
    request: { description: '测试任务' },
    steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }],
    results: [
      {
        stepIndex: 0,
        agentId: 'agent_001',
        status: 'success',
        output: { data: 'ok' },
        summary: '完成',
        startedAt: Date.now() - 1000,
        finishedAt: Date.now()
      }
    ],
    startedAt: Date.now() - 1000,
    finishedAt: Date.now(),
    createdAt: Date.now() - 1000,
    ...overrides
  }
}

describe('FeedbackScorer', () => {
  let scorer

  beforeEach(() => {
    scorer = new FeedbackScorer()
  })

  describe('compute', () => {
    it('returns 1.0 for a perfect single-step success task', () => {
      const task = makeTask()
      const score = scorer.compute(task)
      expect(score).toBe(1.0)
    })

    it('returns 0.4 for a failed task (1.0 - 0.6)', () => {
      const task = makeTask({ status: 'failure' })
      const score = scorer.compute(task)
      expect(score).toBe(0.4)
    })

    it('returns 0.8 for a partial task (1.0 - 0.2)', () => {
      const task = makeTask({ status: 'partial' })
      const score = scorer.compute(task)
      expect(score).toBe(0.8)
    })

    it('deducts 0.1 per retry', () => {
      const task = makeTask({
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          retryCount: 2,
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task)
      expect(score).toBe(0.8) // 1.0 - 2 * 0.1
    })

    it('deducts 0.15 for low confidence (< 0.5)', () => {
      const task = makeTask({
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          output: { confidence: 0.3 },
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task)
      // 1.0 - 0.15 = 0.85, clamped to 0.85
      // confidence mix: 0.85 * 0.7 + 0.3 * 0.3 = 0.595 + 0.09 = 0.685
      expect(score).toBeCloseTo(0.685, 3)
    })

    it('does not deduct for high confidence (>= 0.5)', () => {
      const task = makeTask({
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          output: { confidence: 0.8 },
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task)
      // 1.0, no low_confidence deduction
      // confidence mix: 1.0 * 0.7 + 0.8 * 0.3 = 0.7 + 0.24 = 0.94
      expect(score).toBeCloseTo(0.94, 3)
    })

    it('deducts 0.1 for usedFallback', () => {
      const task = makeTask()
      const score = scorer.compute(task, { usedFallback: true })
      expect(score).toBe(0.9)
    })

    it('adds 0.05 for fast execution (durationRatio < 0.3)', () => {
      const now = Date.now()
      const task = makeTask({
        startedAt: now - 100,  // 100ms
        finishedAt: now,
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          startedAt: now - 100,
          finishedAt: now
        }]
      })
      const score = scorer.compute(task, { timeoutMs: 1000 }) // ratio = 100/1000 = 0.1 < 0.3
      expect(score).toBe(1.0) // 1.0 + 0.05 = 1.05 clamped to 1.0
    })

    it('does not add bonus for slow execution', () => {
      const now = Date.now()
      const task = makeTask({
        startedAt: now - 500,
        finishedAt: now,
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          startedAt: now - 500,
          finishedAt: now
        }]
      })
      const score = scorer.compute(task, { timeoutMs: 1000 }) // ratio = 500/1000 = 0.5 > 0.3
      expect(score).toBe(1.0)
    })

    it('clamps score to 0 when all deductions apply maximally', () => {
      const task = makeTask({
        status: 'failure',
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'failure',
          retryCount: 10,
          output: { confidence: 0.1 },
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task, { usedFallback: true })
      // 1.0 - 0.6 (failure) - 10 * 0.1 (retries) - 0.15 (low_conf) - 0.1 (fallback)
      // = 1.0 - 0.6 - 1.0 - 0.15 - 0.1 = -0.85
      // clamped to 0
      // confidence mix: 0 * 0.7 + 0.1 * 0.3 = 0.03
      expect(score).toBeCloseTo(0.03, 3)
      expect(score).toBeGreaterThanOrEqual(0)
    })

    it('handles task with no results', () => {
      const task = makeTask({ results: [] })
      const score = scorer.compute(task)
      expect(score).toBe(1.0)
    })

    it('handles task with undefined results', () => {
      const task = makeTask({ results: undefined })
      const score = scorer.compute(task)
      expect(score).toBe(1.0)
    })

    it('computes average confidence from multiple results', () => {
      const task = makeTask({
        results: [
          {
            stepIndex: 0,
            agentId: 'agent_001',
            status: 'success',
            output: { confidence: 0.6 },
            startedAt: Date.now() - 1000,
            finishedAt: Date.now()
          },
          {
            stepIndex: 1,
            agentId: 'agent_002',
            status: 'success',
            output: { confidence: 0.8 },
            startedAt: Date.now() - 500,
            finishedAt: Date.now()
          }
        ]
      })
      const score = scorer.compute(task)
      // 1.0, no low_confidence deduction (avg = 0.7 > 0.5)
      // confidence mix: 1.0 * 0.7 + 0.7 * 0.3 = 0.7 + 0.21 = 0.91
      expect(score).toBeCloseTo(0.91, 3)
    })

    it('reads confidence from usage.confidence', () => {
      const task = makeTask({
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          usage: { confidence: 0.4 },
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task)
      // 1.0 - 0.15 (low_conf) = 0.85
      // confidence mix: 0.85 * 0.7 + 0.4 * 0.3 = 0.595 + 0.12 = 0.715
      expect(score).toBeCloseTo(0.715, 3)
    })

    it('clamps out-of-bound confidence values (> 1.0)', () => {
      const task = makeTask({
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          output: { confidence: 2.5 },
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task)
      // confidence clamped to 1.0, no low_conf deduction (1.0 >= 0.5)
      // confidence mix: 1.0 * 0.7 + 1.0 * 0.3 = 1.0
      expect(score).toBe(1.0)
    })

    it('clamps negative confidence values (< 0)', () => {
      const task = makeTask({
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'success',
          output: { confidence: -0.5 },
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task)
      // confidence clamped to 0, avgConfidence = 0, treated as unavailable
      // no low_conf deduction, no confidence mix → score = 1.0
      expect(score).toBe(1.0)
    })

    it('combines failure + retries + fallback + low_confidence', () => {
      const task = makeTask({
        status: 'failure',
        results: [{
          stepIndex: 0,
          agentId: 'agent_001',
          status: 'failure',
          retryCount: 3,
          output: { confidence: 0.2 },
          startedAt: Date.now() - 5000,
          finishedAt: Date.now()
        }]
      })
      const score = scorer.compute(task, { usedFallback: true })
      // 1.0 - 0.6 - 0.3 - 0.15 - 0.1 = -0.15 → clamp to 0
      // confidence mix: 0 * 0.7 + 0.2 * 0.3 = 0.06
      expect(score).toBeCloseTo(0.06, 3)
      expect(score).toBeGreaterThanOrEqual(0)
    })
  })

  describe('normalizeUserScore', () => {
    it('maps 1 → 0.0', () => {
      expect(scorer.normalizeUserScore(1)).toBe(0)
    })

    it('maps 5 → 1.0', () => {
      expect(scorer.normalizeUserScore(5)).toBe(1)
    })

    it('maps 3 → 0.5', () => {
      expect(scorer.normalizeUserScore(3)).toBe(0.5)
    })

    it('maps 2 → 0.25', () => {
      expect(scorer.normalizeUserScore(2)).toBe(0.25)
    })
  })

  describe('final', () => {
    it('returns autoScore when no userScore', () => {
      expect(scorer.final(0.8)).toBe(0.8)
    })

    it('returns autoScore when userScore is null', () => {
      expect(scorer.final(0.8, null)).toBe(0.8)
    })

    it('combines auto and user score with 30/70 weight', () => {
      // autoScore=1.0, userScore=5 → normalized=1.0
      // 1.0 * 0.3 + 1.0 * 0.7 = 1.0
      expect(scorer.final(1.0, 5)).toBe(1.0)
    })

    it('combines low auto with high user score', () => {
      // autoScore=0.4, userScore=5 → normalized=1.0
      // 0.4 * 0.3 + 1.0 * 0.7 = 0.12 + 0.7 = 0.82
      expect(scorer.final(0.4, 5)).toBeCloseTo(0.82, 3)
    })

    it('combines high auto with low user score', () => {
      // autoScore=1.0, userScore=1 → normalized=0.0
      // 1.0 * 0.3 + 0.0 * 0.7 = 0.3
      expect(scorer.final(1.0, 1)).toBeCloseTo(0.3, 3)
    })

    it('clamps result to [0, 1]', () => {
      const result = scorer.final(0, 1)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(1)
    })
  })
})
