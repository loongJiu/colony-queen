import { describe, it, expect } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { CircuitBreaker } from '../../src/services/circuit-breaker.js'
import { createCapabilityProfile } from '../../src/models/capability-profile.js'
import { UnavailableError } from '../../src/utils/errors.js'

function makeSpec(overrides = {}) {
  return {
    identity: {
      role: 'worker',
      name: 'TestWorker',
      ...overrides.identity
    },
    runtime: { endpoint: 'http://localhost:4001', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['code_generation'],
    model: overrides.model ?? {},
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? [],
    constraints: overrides.constraints
  }
}

function makeScheduler({ circuitBreaker, store } = {}) {
  const hive = new Hive()
  const scheduler = new Scheduler({ hive, circuitBreaker, store })
  return { hive, scheduler }
}

describe('Scheduler', () => {
  // ── selectAgent ─────────────────────────────

  describe('selectAgent', () => {
    it('selects the only matching agent', () => {
      const { hive, scheduler } = makeScheduler()
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

      const agent = scheduler.selectAgent('search')

      expect(agent.capabilities).toContain('search')
    })

    it('throws UnavailableError when no agent has the capability', () => {
      const { hive, scheduler } = makeScheduler()
      hive.register(makeSpec({ capabilities: ['code_generation'] }), 'sess_1')

      expect(() => scheduler.selectAgent('search'))
        .toThrow(UnavailableError)
    })

    it('throws UnavailableError when no agent is registered', () => {
      const { scheduler } = makeScheduler()

      expect(() => scheduler.selectAgent('search'))
        .toThrow(UnavailableError)
    })

    it('throws UnavailableError when capability is empty', () => {
      const { scheduler } = makeScheduler()

      expect(() => scheduler.selectAgent(''))
        .toThrow(UnavailableError)
    })

    it('excludes offline agents', () => {
      const { hive, scheduler } = makeScheduler()
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      hive.register(makeSpec({
        identity: { name: 'Online' },
        capabilities: ['search']
      }), 'sess_2')

      const offlineAgent = hive.getBySessionToken('sess_1')
      hive.markOffline(offlineAgent.agentId)

      const selected = scheduler.selectAgent('search')

      expect(selected.agentId).not.toBe(offlineAgent.agentId)
      expect(selected.status).not.toBe('offline')
    })

    it('excludes error agents', () => {
      const { hive, scheduler } = makeScheduler()
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      hive.register(makeSpec({
        identity: { name: 'Error' },
        capabilities: ['search']
      }), 'sess_2')

      const errorAgent = hive.getBySessionToken('sess_1')
      hive.updateHeartbeat(errorAgent.agentId, { status: 'error' })

      const selected = scheduler.selectAgent('search')

      expect(selected.agentId).not.toBe(errorAgent.agentId)
      expect(selected.status).not.toBe('error')
    })

    it('throws UnavailableError when all matching agents are unhealthy', () => {
      const { hive, scheduler } = makeScheduler()
      const agent = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

      hive.markOffline(agent.agentId)

      expect(() => scheduler.selectAgent('search'))
        .toThrow(UnavailableError)
    })

    it('selects agent with lowest load', () => {
      const { hive, scheduler } = makeScheduler()

      hive.register(makeSpec({
        identity: { name: 'Busy' },
        capabilities: ['search']
      }), 'sess_1')
      hive.register(makeSpec({
        identity: { name: 'Light' },
        capabilities: ['search']
      }), 'sess_2')

      const busy = hive.getBySessionToken('sess_1')
      const light = hive.getBySessionToken('sess_2')

      hive.updateHeartbeat(busy.agentId, { load: 0.8 })
      hive.updateHeartbeat(light.agentId, { load: 0.2 })

      const selected = scheduler.selectAgent('search')

      expect(selected.agentId).toBe(light.agentId)
    })

    it('breaks load ties by activeTasks', () => {
      const { hive, scheduler } = makeScheduler()

      hive.register(makeSpec({
        identity: { name: 'MoreTasks' },
        capabilities: ['search']
      }), 'sess_1')
      hive.register(makeSpec({
        identity: { name: 'FewerTasks' },
        capabilities: ['search']
      }), 'sess_2')

      const moreTasks = hive.getBySessionToken('sess_1')
      const fewerTasks = hive.getBySessionToken('sess_2')

      hive.updateHeartbeat(moreTasks.agentId, { load: 0.5, activeTasks: 5 })
      hive.updateHeartbeat(fewerTasks.agentId, { load: 0.5, activeTasks: 1 })

      const selected = scheduler.selectAgent('search')

      expect(selected.agentId).toBe(fewerTasks.agentId)
    })

    it('selects among agents with multiple capabilities', () => {
      const { hive, scheduler } = makeScheduler()

      hive.register(makeSpec({
        capabilities: ['search', 'analysis']
      }), 'sess_1')
      hive.register(makeSpec({
        capabilities: ['search']
      }), 'sess_2')

      const selected = scheduler.selectAgent('analysis')

      expect(selected.capabilities).toContain('analysis')
    })

    it('handles 3+ agents with varying loads', () => {
      const { hive, scheduler } = makeScheduler()

      hive.register(makeSpec({ identity: { name: 'A' }, capabilities: ['search'] }), 'sess_1')
      hive.register(makeSpec({ identity: { name: 'B' }, capabilities: ['search'] }), 'sess_2')
      hive.register(makeSpec({ identity: { name: 'C' }, capabilities: ['search'] }), 'sess_3')

      const a = hive.getBySessionToken('sess_1')
      const b = hive.getBySessionToken('sess_2')
      const c = hive.getBySessionToken('sess_3')

      hive.updateHeartbeat(a.agentId, { load: 0.7 })
      hive.updateHeartbeat(b.agentId, { load: 0.3 })
      hive.updateHeartbeat(c.agentId, { load: 0.5 })

      const selected = scheduler.selectAgent('search')

      expect(selected.agentId).toBe(b.agentId)
    })
  })

  // ── selectAgentExcluding ────────────────────

  describe('selectAgentExcluding', () => {
    it('excludes specified agent IDs', () => {
      const { hive, scheduler } = makeScheduler()
      const a1 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_2')

      const selected = scheduler.selectAgentExcluding('search', [a1.agentId])

      expect(selected.agentId).not.toBe(a1.agentId)
    })

    it('throws when all agents are excluded', () => {
      const { hive, scheduler } = makeScheduler()
      const a1 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

      expect(() => scheduler.selectAgentExcluding('search', [a1.agentId]))
        .toThrow(UnavailableError)
    })
  })

  // ── isAvailable ─────────────────────────────

  describe('isAvailable', () => {
    it('returns true for idle agent', () => {
      const { hive, scheduler } = makeScheduler()
      const agent = hive.register(makeSpec(), 'sess_1')

      expect(scheduler.isAvailable(agent.agentId)).toBe(true)
    })

    it('returns true for busy agent', () => {
      const { hive, scheduler } = makeScheduler()
      const agent = hive.register(makeSpec(), 'sess_1')

      hive.updateHeartbeat(agent.agentId, { status: 'busy' })

      expect(scheduler.isAvailable(agent.agentId)).toBe(true)
    })

    it('returns false for offline agent', () => {
      const { hive, scheduler } = makeScheduler()
      const agent = hive.register(makeSpec(), 'sess_1')

      hive.markOffline(agent.agentId)

      expect(scheduler.isAvailable(agent.agentId)).toBe(false)
    })

    it('returns false for error agent', () => {
      const { hive, scheduler } = makeScheduler()
      const agent = hive.register(makeSpec(), 'sess_1')

      hive.updateHeartbeat(agent.agentId, { status: 'error' })

      expect(scheduler.isAvailable(agent.agentId)).toBe(false)
    })

    it('returns false for unknown agent', () => {
      const { scheduler } = makeScheduler()

      expect(scheduler.isAvailable('nonexistent')).toBe(false)
    })

    it('returns false for unregistered agent', () => {
      const { hive, scheduler } = makeScheduler()
      const agent = hive.register(makeSpec(), 'sess_1')

      hive.unregister(agent.agentId)

      expect(scheduler.isAvailable(agent.agentId)).toBe(false)
    })
  })

  // ── v3.0: 熔断器集成 ──────────────────────────

  describe('circuit breaker integration', () => {
    it('excludes circuit-broken agents', () => {
      const circuitBreaker = new CircuitBreaker()
      const { hive, scheduler } = makeScheduler({ circuitBreaker })

      const a1 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_2')

      // Burn agent 1
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(a1.agentId)
      }

      const selected = scheduler.selectAgent('search')
      expect(selected.agentId).not.toBe(a1.agentId)
    })

    it('isAvailable returns false for circuit-broken agent', () => {
      const circuitBreaker = new CircuitBreaker()
      const { hive, scheduler } = makeScheduler({ circuitBreaker })
      const agent = hive.register(makeSpec(), 'sess_1')

      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(agent.agentId)
      }

      expect(scheduler.isAvailable(agent.agentId)).toBe(false)
    })

    it('throws when all agents are circuit-broken', () => {
      const circuitBreaker = new CircuitBreaker()
      const { hive, scheduler } = makeScheduler({ circuitBreaker })

      const a1 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      const a2 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_2')

      for (const a of [a1, a2]) {
        for (let i = 0; i < 5; i++) {
          circuitBreaker.recordFailure(a.agentId)
        }
      }

      expect(() => scheduler.selectAgent('search'))
        .toThrow(UnavailableError)
    })
  })

  // ── v3.0: 画像加权调度 ──────────────────────────

  describe('profile-based weighted selection', () => {
    it('uses profile for weighted selection when cached', () => {
      const hive = new Hive()
      const scheduler = new Scheduler({ hive })

      const a1 = hive.register(makeSpec({
        identity: { name: 'HighScore' },
        capabilities: ['search']
      }), 'sess_1')
      const a2 = hive.register(makeSpec({
        identity: { name: 'LowScore' },
        capabilities: ['search']
      }), 'sess_2')

      // 直接更新缓存
      scheduler.updateProfileCache(createCapabilityProfile({
        agentId: a1.agentId,
        capability: 'search',
        actualScore: 0.9,
        taskCount: 50,
        successRate: 0.9
      }))
      scheduler.updateProfileCache(createCapabilityProfile({
        agentId: a2.agentId,
        capability: 'search',
        actualScore: 0.3,
        taskCount: 50,
        successRate: 0.3
      }))

      // Run many selections to verify statistical preference
      const counts = { [a1.agentId]: 0, [a2.agentId]: 0 }
      for (let i = 0; i < 100; i++) {
        const selected = scheduler.selectAgent('search')
        counts[selected.agentId]++
      }

      // Higher-scored agent should be selected more often
      expect(counts[a1.agentId]).toBeGreaterThan(counts[a2.agentId])
    })

    it('refreshes profiles from store', async () => {
      const profiles = new Map()
      const store = {
        async getProfile(agentId, capability) {
          return profiles.get(`${agentId}:${capability}`) ?? null
        }
      }

      const hive = new Hive()
      const scheduler = new Scheduler({ hive, store })

      const a1 = hive.register(makeSpec({
        capabilities: ['search']
      }), 'sess_1')

      profiles.set(`${a1.agentId}:search`, createCapabilityProfile({
        agentId: a1.agentId,
        capability: 'search',
        actualScore: 0.95,
        taskCount: 50,
        successRate: 0.95
      }))

      await scheduler.refreshProfiles()

      // After refresh, profile should be cached
      const selected = scheduler.selectAgent('search')
      expect(selected.agentId).toBe(a1.agentId)
    })

    it('falls back to load balancing when no profiles exist', () => {
      const { hive, scheduler } = makeScheduler()
      const a1 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
      const a2 = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_2')

      hive.updateHeartbeat(a1.agentId, { load: 0.8 })
      hive.updateHeartbeat(a2.agentId, { load: 0.2 })

      const selected = scheduler.selectAgent('search')
      expect(selected.agentId).toBe(a2.agentId)
    })
  })

  // ── v3.0: computeWeight ────────────────────────

  describe('computeWeight', () => {
    it('returns cold start weight for low taskCount', () => {
      const { scheduler } = makeScheduler()
      const hive = new Hive()
      const agent = hive.register(makeSpec(), 'sess_1')
      const profile = createCapabilityProfile({
        agentId: agent.agentId,
        capability: 'search',
        actualScore: 0.9,
        taskCount: 5
      })

      const weight = scheduler.computeWeight(agent, profile)
      expect(weight).toBe(0.6) // COLD_START_WEIGHT
    })

    it('factors in actualScore, trend, load, and successRate', () => {
      const { scheduler } = makeScheduler()
      const hive = new Hive()
      const agent = hive.register(makeSpec(), 'sess_1')
      const zeroLoadAgent = hive.updateHeartbeat(agent.agentId, { load: 0 })

      const profile = createCapabilityProfile({
        agentId: agent.agentId,
        capability: 'search',
        actualScore: 0.9,
        taskCount: 50,
        successRate: 0.9,
        recentTrend: 'improving'
      })

      const weight = scheduler.computeWeight(zeroLoadAgent, profile)
      expect(weight).toBeGreaterThan(0.5)
      expect(weight).toBeLessThanOrEqual(1)
    })

    it('penalizes declining trend', () => {
      const { scheduler } = makeScheduler()
      const hive = new Hive()
      const agent = hive.register(makeSpec(), 'sess_1')
      const zeroLoadAgent = hive.updateHeartbeat(agent.agentId, { load: 0 })

      const stable = createCapabilityProfile({
        agentId: agent.agentId,
        capability: 'search',
        actualScore: 0.8,
        taskCount: 50,
        successRate: 0.8,
        recentTrend: 'stable'
      })
      const declining = createCapabilityProfile({
        agentId: agent.agentId,
        capability: 'search',
        actualScore: 0.8,
        taskCount: 50,
        successRate: 0.8,
        recentTrend: 'declining'
      })

      const wStable = scheduler.computeWeight(zeroLoadAgent, stable)
      const wDeclining = scheduler.computeWeight(zeroLoadAgent, declining)
      expect(wStable).toBeGreaterThan(wDeclining)
    })

    it('penalizes high load', () => {
      const { scheduler } = makeScheduler()
      const hive = new Hive()
      const agent = hive.register(makeSpec(), 'sess_1')

      const profile = createCapabilityProfile({
        agentId: agent.agentId,
        capability: 'search',
        actualScore: 0.9,
        taskCount: 50,
        successRate: 0.9
      })

      const lowLoadAgent = hive.updateHeartbeat(agent.agentId, { load: 0 })
      const wLowLoad = scheduler.computeWeight(lowLoadAgent, profile)

      const highLoadAgent = hive.updateHeartbeat(agent.agentId, { load: 1.0 })
      const wHighLoad = scheduler.computeWeight(highLoadAgent, profile)

      expect(wLowLoad).toBeGreaterThan(wHighLoad)
    })
  })
})
