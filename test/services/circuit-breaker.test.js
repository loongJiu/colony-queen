import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CIRCUIT_STATES } from '../../src/services/circuit-breaker.js'

describe('CircuitBreaker', () => {
  let breaker

  beforeEach(() => {
    breaker = new CircuitBreaker()
  })

  // ── 基本状态 ────────────────────────────────

  describe('initial state', () => {
    it('starts in closed state for unknown agents', () => {
      expect(breaker.getState('agent_001')).toBe('closed')
    })

    it('isOpen returns false for unknown agents', () => {
      expect(breaker.isOpen('agent_001')).toBe(false)
    })

    it('exports correct CIRCUIT_STATES', () => {
      expect(CIRCUIT_STATES.CLOSED).toBe('closed')
      expect(CIRCUIT_STATES.OPEN).toBe('open')
      expect(CIRCUIT_STATES.HALF_OPEN).toBe('half_open')
    })
  })

  // ── closed → open 触发条件 ──────────────────

  describe('consecutive failures trigger', () => {
    it('opens after 5 consecutive failures (default threshold)', () => {
      for (let i = 0; i < 4; i++) {
        breaker.recordFailure('agent_001')
        expect(breaker.isOpen('agent_001')).toBe(false)
      }

      // 5th failure triggers open
      breaker.recordFailure('agent_001')
      expect(breaker.isOpen('agent_001')).toBe(true)
      expect(breaker.getState('agent_001')).toBe('open')
    })

    it('resets consecutive failure count on success', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      for (let i = 0; i < 4; i++) {
        breaker.recordFailure('agent_001')
      }

      // Success resets consecutive counter and adds a success to window
      breaker.recordSuccess('agent_001')

      // Advance past window so old failure counts are cleared
      vi.advanceTimersByTime(60_001)

      // Now need 5 more consecutive failures
      for (let i = 0; i < 4; i++) {
        breaker.recordFailure('agent_001')
        expect(breaker.isOpen('agent_001')).toBe(false)
      }

      breaker.recordFailure('agent_001')
      expect(breaker.isOpen('agent_001')).toBe(true)

      vi.useRealTimers()
    })

    it('respects custom failureThreshold', () => {
      const customBreaker = new CircuitBreaker({ failureThreshold: 3 })

      for (let i = 0; i < 2; i++) {
        customBreaker.recordFailure('agent_001')
        expect(customBreaker.isOpen('agent_001')).toBe(false)
      }

      customBreaker.recordFailure('agent_001')
      expect(customBreaker.isOpen('agent_001')).toBe(true)
    })
  })

  describe('window failure rate trigger', () => {
    it('opens when window failure rate exceeds 50% with minimum calls', () => {
      // Use a fresh breaker to avoid interference from beforeEach
      const rateBreaker = new CircuitBreaker()

      // Interleave successes and failures to keep consecutiveFailures low
      // but build up window failure rate
      rateBreaker.recordSuccess('agent_rate')  // s=1, f=0
      rateBreaker.recordFailure('agent_rate')  // s=1, f=1, consecutive=1
      rateBreaker.recordSuccess('agent_rate')  // s=2, f=1, consecutive=0
      rateBreaker.recordFailure('agent_rate')  // s=2, f=2, consecutive=1
      rateBreaker.recordSuccess('agent_rate')  // s=3, f=2, consecutive=0
      rateBreaker.recordFailure('agent_rate')  // s=3, f=3, consecutive=1, rate=3/6=0.5 (not > 0.5)
      rateBreaker.recordFailure('agent_rate')  // s=3, f=4, consecutive=2, rate=4/7=0.571 > 0.5
      // rate trigger: totalCalls(7) >= threshold(5) && rate(4/7=0.571) > 0.5
      expect(rateBreaker.isOpen('agent_rate')).toBe(true)
    })
  })

  // ── open → half_open 恢复 ──────────────────

  describe('recovery via half_open', () => {
    it('stays open during cooldown period', () => {
      breaker.recordFailure('agent_001')
      breaker.recordFailure('agent_001')
      breaker.recordFailure('agent_001')
      breaker.recordFailure('agent_001')
      breaker.recordFailure('agent_001')

      expect(breaker.isOpen('agent_001')).toBe(true)

      // Still within cooldown (default 30s)
      expect(breaker.isOpen('agent_001')).toBe(true)
    })

    it('transitions to half_open after cooldown', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // Trigger open state
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }
      expect(breaker.isOpen('agent_001')).toBe(true)

      // Advance past cooldown (30s)
      vi.advanceTimersByTime(30_001)
      expect(breaker.isOpen('agent_001')).toBe(false) // half_open allows traffic
      expect(breaker.getState('agent_001')).toBe('half_open')

      vi.useRealTimers()
    })

    it('recovers to closed on success in half_open', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }

      vi.advanceTimersByTime(30_001)
      expect(breaker.getState('agent_001')).toBe('half_open')

      breaker.recordSuccess('agent_001')
      expect(breaker.getState('agent_001')).toBe('closed')
      expect(breaker.isOpen('agent_001')).toBe(false)

      vi.useRealTimers()
    })

    it('returns to open on failure in half_open', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }

      vi.advanceTimersByTime(30_001)
      expect(breaker.getState('agent_001')).toBe('half_open')

      breaker.recordFailure('agent_001')
      expect(breaker.getState('agent_001')).toBe('open')
      expect(breaker.isOpen('agent_001')).toBe(true) // back to open, cooldown restarts

      vi.useRealTimers()
    })
  })

  // ── 状态机完整性 ──────────────────────────────

  describe('state machine completeness', () => {
    it('closed + success stays closed', () => {
      breaker.recordSuccess('agent_001')
      expect(breaker.getState('agent_001')).toBe('closed')
    })

    it('closed + failure increments counter but stays closed (under threshold)', () => {
      breaker.recordFailure('agent_001')
      expect(breaker.getState('agent_001')).toBe('closed')
    })

    it('half_open allows one probe call', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }

      vi.advanceTimersByTime(30_001)
      // isOpen returns false for half_open, allowing the probe
      expect(breaker.isOpen('agent_001')).toBe(false)

      vi.useRealTimers()
    })

    it('full cycle: closed -> open -> half_open -> closed', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // closed -> open
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }
      expect(breaker.getState('agent_001')).toBe('open')

      // open -> half_open
      vi.advanceTimersByTime(30_001)
      expect(breaker.getState('agent_001')).toBe('half_open')

      // half_open -> closed (success)
      breaker.recordSuccess('agent_001')
      expect(breaker.getState('agent_001')).toBe('closed')

      vi.useRealTimers()
    })

    it('full cycle: closed -> open -> half_open -> open', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // closed -> open
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }
      expect(breaker.getState('agent_001')).toBe('open')

      // open -> half_open
      vi.advanceTimersByTime(30_001)
      expect(breaker.getState('agent_001')).toBe('half_open')

      // half_open -> open (failure)
      breaker.recordFailure('agent_001')
      expect(breaker.getState('agent_001')).toBe('open')

      vi.useRealTimers()
    })
  })

  // ── 重置和查询 ──────────────────────────────

  describe('reset', () => {
    it('resets agent state to initial', () => {
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }
      expect(breaker.isOpen('agent_001')).toBe(true)

      breaker.reset('agent_001')
      expect(breaker.isOpen('agent_001')).toBe(false)
      expect(breaker.getState('agent_001')).toBe('closed')
    })
  })

  describe('getOpenAgents', () => {
    it('returns empty array when no agents are open', () => {
      expect(breaker.getOpenAgents()).toEqual([])
    })

    it('returns all open agent IDs', () => {
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
        breaker.recordFailure('agent_002')
      }
      breaker.recordSuccess('agent_003')

      const openAgents = breaker.getOpenAgents()
      expect(openAgents).toContain('agent_001')
      expect(openAgents).toContain('agent_002')
      expect(openAgents).not.toContain('agent_003')
    })
  })

  // ── 滑动窗口 ────────────────────────────────

  describe('sliding window', () => {
    it('resets window counts after window expires', () => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // Record 4 failures in first window
      for (let i = 0; i < 4; i++) {
        breaker.recordFailure('agent_001')
      }
      expect(breaker.getState('agent_001')).toBe('closed')

      // Advance past window (60s) - window counts reset
      vi.advanceTimersByTime(60_001)

      // consecutiveFailures is NOT reset (only windowCounts are)
      // So next failure will make consecutiveFailures = 5, triggering open
      breaker.recordFailure('agent_001')
      expect(breaker.getState('agent_001')).toBe('open')

      vi.useRealTimers()
    })

    it('respects custom windowMs', () => {
      const customBreaker = new CircuitBreaker({ windowMs: 10_000, failureThreshold: 3 })
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // 2 failures in first window
      customBreaker.recordFailure('agent_001')
      customBreaker.recordFailure('agent_001')

      // Wait for window to expire
      vi.advanceTimersByTime(10_001)

      // Window counts reset, but consecutiveFailures carries over
      // consecutiveFailures is already 2, one more failure = 3, triggers open
      customBreaker.recordFailure('agent_001')
      expect(customBreaker.isOpen('agent_001')).toBe(true)

      vi.useRealTimers()
    })
  })

  // ── 多 Agent 隔离 ──────────────────────────

  describe('agent isolation', () => {
    it('maintains independent state per agent', () => {
      // Break agent_001
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
      }
      expect(breaker.isOpen('agent_001')).toBe(true)

      // agent_002 is still healthy
      expect(breaker.isOpen('agent_002')).toBe(false)
      expect(breaker.getState('agent_002')).toBe('closed')
    })

    it('resetting one agent does not affect others', () => {
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('agent_001')
        breaker.recordFailure('agent_002')
      }

      breaker.reset('agent_001')
      expect(breaker.isOpen('agent_001')).toBe(false)
      expect(breaker.isOpen('agent_002')).toBe(true)
    })
  })

  // ── 自定义配置 ──────────────────────────────

  describe('custom configuration', () => {
    it('uses default values when no options provided', () => {
      const defaultBreaker = new CircuitBreaker()
      // Default: failureThreshold=5, windowMs=60000, cooldownMs=30000
      // Verify by triggering with 5 failures
      for (let i = 0; i < 5; i++) {
        defaultBreaker.recordFailure('agent_001')
      }
      expect(defaultBreaker.isOpen('agent_001')).toBe(true)
    })

    it('respects custom cooldownMs', () => {
      const customBreaker = new CircuitBreaker({ cooldownMs: 5000, failureThreshold: 3 })
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      for (let i = 0; i < 3; i++) {
        customBreaker.recordFailure('agent_001')
      }
      expect(customBreaker.isOpen('agent_001')).toBe(true)

      // Not yet cooled down
      vi.advanceTimersByTime(4999)
      expect(customBreaker.isOpen('agent_001')).toBe(true)

      // Cooled down
      vi.advanceTimersByTime(2)
      expect(customBreaker.isOpen('agent_001')).toBe(false)
      expect(customBreaker.getState('agent_001')).toBe('half_open')

      vi.useRealTimers()
    })
  })
})
