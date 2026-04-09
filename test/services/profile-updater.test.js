import { describe, it, expect } from 'vitest'
import { ProfileUpdater } from '../../src/services/profile-updater.js'

describe('ProfileUpdater', () => {
  describe('updateOnTaskComplete (no store)', () => {
    it('creates a new profile when none exists', async () => {
      const updater = new ProfileUpdater()
      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.8,
        success: true,
        durationMs: 1500
      })

      expect(profile.agentId).toBe('agent_001')
      expect(profile.capability).toBe('search')
      expect(profile.actualScore).toBeCloseTo(0.53, 10) // ema(0.5, 0.8, 0.1) = 0.5*0.9 + 0.8*0.1 = 0.53
      expect(profile.taskCount).toBe(1)
      expect(profile.successRate).toBe(1)
      expect(profile.avgDuration).toBe(1500)
      expect(profile.recentTrend).toBe('stable') // no history
    })

    it('applies EMA update to actualScore', async () => {
      const updater = new ProfileUpdater()

      // First update: ema(0.5, 0.9, 0.1) = 0.54
      const p1 = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.9,
        success: true,
        durationMs: 1000
      })
      expect(p1.actualScore).toBeCloseTo(0.54, 10)
    })

    it('uses custom alpha when provided', async () => {
      const updater = new ProfileUpdater({ alpha: 0.5 })

      // ema(0.5, 1.0, 0.5) = 0.75
      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 1.0,
        success: true,
        durationMs: 1000
      })

      expect(profile.actualScore).toBeCloseTo(0.75, 10)
    })

    it('updates successRate correctly for success', async () => {
      const updater = new ProfileUpdater()

      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.5,
        success: true,
        durationMs: 1000
      })

      expect(profile.taskCount).toBe(1)
      expect(profile.successRate).toBe(1)
    })

    it('updates successRate correctly for failure', async () => {
      const updater = new ProfileUpdater()

      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.2,
        success: false,
        durationMs: 1000
      })

      expect(profile.taskCount).toBe(1)
      expect(profile.successRate).toBe(0)
    })

    it('calculates avgDuration with incremental average', async () => {
      const updater = new ProfileUpdater()

      // First task: 1000ms
      const p1 = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.5,
        success: true,
        durationMs: 1000
      })
      expect(p1.avgDuration).toBe(1000)

      // Without store, profile doesn't persist, so next call starts fresh
      // avgDuration = 0 * 0 + 2000 / 1 = 2000
      const p2 = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.5,
        success: true,
        durationMs: 2000
      })
      // Without store, this is a new profile again, so avgDuration = 2000
      expect(p2.avgDuration).toBe(2000)
    })

    it('returns frozen profile', async () => {
      const updater = new ProfileUpdater()
      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.5,
        success: true,
        durationMs: 1000
      })

      expect(Object.isFrozen(profile)).toBe(true)
    })

    it('preserves declaredConfidence from existing profile', async () => {
      // Without store, existing profile always null, so declaredConfidence is always 0.5
      const updater = new ProfileUpdater()
      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.5,
        success: true,
        durationMs: 1000
      })

      expect(profile.declaredConfidence).toBe(0.5)
    })
  })

  describe('updateOnTaskComplete (with mock store)', () => {
    function createMockStore(initialProfile = null, recentScores = []) {
      return {
        _profile: initialProfile,
        _recentScores: recentScores,
        upsertCalls: [],

        async getProfile() {
          return this._profile
        },
        async getRecentScores() {
          return [...this._recentScores]
        },
        async upsertProfile(profile) {
          this.upsertCalls.push(profile)
          this._profile = profile
        }
      }
    }

    it('persists profile to store', async () => {
      const store = createMockStore()
      const updater = new ProfileUpdater({ store })

      await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.8,
        success: true,
        durationMs: 1000
      })

      expect(store.upsertCalls.length).toBe(1)
      expect(store.upsertCalls[0].agentId).toBe('agent_001')
    })

    it('accumulates profile across multiple updates', async () => {
      const store = createMockStore()
      const updater = new ProfileUpdater({ store })

      // First update
      await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.8,
        success: true,
        durationMs: 1000
      })

      // Second update - store has the previous profile
      const p2 = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.9,
        success: true,
        durationMs: 2000
      })

      expect(p2.taskCount).toBe(2)
      expect(p2.successRate).toBe(1)
      expect(p2.avgDuration).toBe(1500) // (1000 + 2000) / 2
    })

    it('updates actualScore with EMA on successive calls', async () => {
      const store = createMockStore()
      const updater = new ProfileUpdater({ store, alpha: 0.3 })

      // ema(0.5, 0.8, 0.3) = 0.5*0.7 + 0.8*0.3 = 0.35 + 0.24 = 0.59
      const p1 = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.8,
        success: true,
        durationMs: 1000
      })
      expect(p1.actualScore).toBeCloseTo(0.59, 10)

      // ema(0.59, 0.9, 0.3) = 0.59*0.7 + 0.9*0.3 = 0.413 + 0.27 = 0.683
      const p2 = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.9,
        success: true,
        durationMs: 1000
      })
      expect(p2.actualScore).toBeCloseTo(0.683, 10)
    })

    it('tracks successRate correctly with mixed results', async () => {
      const store = createMockStore()
      const updater = new ProfileUpdater({ store })

      // 1st: success
      await updater.updateOnTaskComplete({
        agentId: 'agent_001', capability: 'search',
        score: 0.8, success: true, durationMs: 1000
      })

      // 2nd: failure
      const p2 = await updater.updateOnTaskComplete({
        agentId: 'agent_001', capability: 'search',
        score: 0.2, success: false, durationMs: 1000
      })
      expect(p2.taskCount).toBe(2)
      expect(p2.successRate).toBe(0.5)
    })

    it('uses recentScores from store for trend computation', async () => {
      // 40 low scores + 10 high scores = improving trend
      const recentScores = [
        ...Array(40).fill(0.3),
        ...Array(10).fill(0.9)
      ]
      const store = createMockStore(null, recentScores)
      const updater = new ProfileUpdater({ store })

      const profile = await updater.updateOnTaskComplete({
        agentId: 'agent_001',
        capability: 'search',
        score: 0.95,
        success: true,
        durationMs: 1000
      })

      expect(profile.recentTrend).toBe('improving')
    })
  })
})
