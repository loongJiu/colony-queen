import { describe, it, expect } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
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

function makeScheduler() {
  const hive = new Hive()
  const scheduler = new Scheduler({ hive })
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
})
