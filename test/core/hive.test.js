import { describe, it, expect } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { NotFoundError, ValidationError } from '../../src/utils/errors.js'

/** @type {import('../../src/models/agent.js').AgentRecord} */
function makeSpec(overrides = {}) {
  return {
    identity: {
      role: 'worker',
      name: 'TestWorker',
      ...overrides.identity
    },
    runtime: { endpoint: 'http://localhost:4001', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['code_generation'],
    model: overrides.model ?? { provider: 'openai', name: 'gpt-4' },
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? [],
    constraints: overrides.constraints
  }
}

describe('Hive', () => {
  describe('register', () => {
    it('registers an agent and returns the record', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      expect(record.role).toBe('worker')
      expect(record.name).toBe('TestWorker')
      expect(record.status).toBe('idle')
      expect(record.sessionToken).toBe('sess_001')
      expect(record.agentId).toMatch(/^agent_/)
    })

    it('indexes the agent by capability', () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['code_generation', 'debugging'] }), 'sess_001')

      const found = hive.findByCapability('code_generation')
      expect(found).toHaveLength(1)
      expect(found[0].capabilities).toContain('debugging')
    })

    it('indexes the agent by status', () => {
      const hive = new Hive()
      hive.register(makeSpec(), 'sess_001')

      const idle = hive.findByStatus('idle')
      expect(idle).toHaveLength(1)
      expect(idle[0].name).toBe('TestWorker')
    })

    it('rejects duplicate session token', () => {
      const hive = new Hive()
      hive.register(makeSpec(), 'sess_dup')

      expect(() => hive.register(makeSpec(), 'sess_dup'))
        .toThrow(ValidationError)
    })

    it('allows different session tokens', () => {
      const hive = new Hive()
      hive.register(makeSpec(), 'sess_001')
      hive.register(makeSpec({ identity: { role: 'worker', name: 'Other' } }), 'sess_002')

      expect(hive.size).toBe(2)
    })
  })

  describe('unregister', () => {
    it('removes an agent and returns the record', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      const removed = hive.unregister(record.agentId)
      expect(removed.agentId).toBe(record.agentId)
      expect(hive.size).toBe(0)
      expect(hive.get(record.agentId)).toBeUndefined()
    })

    it('cleans up capability indexes', () => {
      const hive = new Hive()
      const record = hive.register(
        makeSpec({ capabilities: ['code_generation', 'debugging'] }),
        'sess_001'
      )

      hive.unregister(record.agentId)

      expect(hive.findByCapability('code_generation')).toEqual([])
      expect(hive.findByCapability('debugging')).toEqual([])
    })

    it('cleans up status indexes', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      hive.unregister(record.agentId)

      expect(hive.findByStatus('idle')).toEqual([])
    })

    it('throws NotFoundError for unknown agentId', () => {
      const hive = new Hive()

      expect(() => hive.unregister('agent_nonexistent'))
        .toThrow(NotFoundError)
    })

    it('does not affect other agents', () => {
      const hive = new Hive()
      const a = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_001')
      const b = hive.register(
        makeSpec({ identity: { role: 'worker', name: 'B' }, capabilities: ['search'] }),
        'sess_002'
      )

      hive.unregister(a.agentId)

      const found = hive.findByCapability('search')
      expect(found).toHaveLength(1)
      expect(found[0].agentId).toBe(b.agentId)
    })
  })

  describe('get', () => {
    it('returns the record for a known agentId', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      expect(hive.get(record.agentId)).toBe(record)
    })

    it('returns undefined for unknown agentId', () => {
      const hive = new Hive()

      expect(hive.get('agent_nonexistent')).toBeUndefined()
    })
  })

  describe('findByCapability', () => {
    it('returns agents with matching capability', () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: ['search', 'analysis'] }), 'sess_001')
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_002')
      hive.register(makeSpec({ capabilities: ['code_generation'] }), 'sess_003')

      const found = hive.findByCapability('search')
      expect(found).toHaveLength(2)
    })

    it('returns empty array for unknown capability', () => {
      const hive = new Hive()

      expect(hive.findByCapability('nonexistent')).toEqual([])
    })

    it('filters out offline agents with activeOnly', () => {
      const hive = new Hive()
      const a = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_001')
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_002')

      hive.markOffline(a.agentId)

      const all = hive.findByCapability('search')
      expect(all).toHaveLength(2)

      const active = hive.findByCapability('search', { activeOnly: true })
      expect(active).toHaveLength(1)
      expect(active[0].status).not.toBe('offline')
    })

    it('handles agent with empty capabilities', () => {
      const hive = new Hive()
      hive.register(makeSpec({ capabilities: [] }), 'sess_001')

      expect(hive.findByCapability('anything')).toEqual([])
    })
  })

  describe('findByStatus', () => {
    it('returns agents with matching status', () => {
      const hive = new Hive()
      hive.register(makeSpec(), 'sess_001')
      hive.register(makeSpec(), 'sess_002')

      const idle = hive.findByStatus('idle')
      expect(idle).toHaveLength(2)
    })

    it('returns empty array for unknown status', () => {
      const hive = new Hive()

      expect(hive.findByStatus('nonexistent')).toEqual([])
    })
  })

  describe('updateHeartbeat', () => {
    it('updates lastHeartbeat timestamp', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      const before = record.lastHeartbeat
      // Small delay to ensure timestamp changes
      const updated = hive.updateHeartbeat(record.agentId, {})

      expect(updated.lastHeartbeat).toBeGreaterThanOrEqual(before)
    })

    it('updates health fields', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      const updated = hive.updateHeartbeat(record.agentId, {
        load: 0.7,
        activeTasks: 3,
        queueDepth: 5
      })

      expect(updated.load).toBe(0.7)
      expect(updated.activeTasks).toBe(3)
      expect(updated.queueDepth).toBe(5)
    })

    it('handles status transition and updates indexes', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      expect(hive.findByStatus('idle')).toHaveLength(1)
      expect(hive.findByStatus('busy')).toHaveLength(0)

      hive.updateHeartbeat(record.agentId, { status: 'busy' })

      expect(hive.findByStatus('idle')).toHaveLength(0)
      expect(hive.findByStatus('busy')).toHaveLength(1)
      expect(hive.get(record.agentId).status).toBe('busy')
    })

    it('throws NotFoundError for unknown agentId', () => {
      const hive = new Hive()

      expect(() => hive.updateHeartbeat('agent_nonexistent', {}))
        .toThrow(NotFoundError)
    })

    it('throws ValidationError for invalid status', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      expect(() => hive.updateHeartbeat(record.agentId, { status: 'flying' }))
        .toThrow(ValidationError)
    })

    it('returns a frozen object', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')
      const updated = hive.updateHeartbeat(record.agentId, { load: 0.5 })

      expect(Object.isFrozen(updated)).toBe(true)
    })
  })

  describe('markOffline', () => {
    it('sets status to offline', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      const updated = hive.markOffline(record.agentId)

      expect(updated.status).toBe('offline')
    })

    it('updates status indexes', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      hive.markOffline(record.agentId)

      expect(hive.findByStatus('idle')).toHaveLength(0)
      expect(hive.findByStatus('offline')).toHaveLength(1)
    })

    it('is idempotent for already-offline agents', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      hive.markOffline(record.agentId)
      hive.markOffline(record.agentId)

      expect(hive.findByStatus('offline')).toHaveLength(1)
    })

    it('throws NotFoundError for unknown agentId', () => {
      const hive = new Hive()

      expect(() => hive.markOffline('agent_nonexistent'))
        .toThrow(NotFoundError)
    })
  })

  describe('size and has', () => {
    it('size returns correct count', () => {
      const hive = new Hive()

      expect(hive.size).toBe(0)

      hive.register(makeSpec(), 'sess_001')
      expect(hive.size).toBe(1)

      hive.register(makeSpec(), 'sess_002')
      expect(hive.size).toBe(2)
    })

    it('has returns boolean correctly', () => {
      const hive = new Hive()

      expect(hive.has('agent_001')).toBe(false)

      const record = hive.register(makeSpec(), 'sess_001')
      expect(hive.has(record.agentId)).toBe(true)
    })

    it('size decreases after unregister', () => {
      const hive = new Hive()
      const record = hive.register(makeSpec(), 'sess_001')

      hive.unregister(record.agentId)

      expect(hive.size).toBe(0)
      expect(hive.has(record.agentId)).toBe(false)
    })
  })

  describe('multi-agent scenarios', () => {
    it('handles agents with overlapping capabilities', () => {
      const hive = new Hive()
      const a = hive.register(
        makeSpec({ capabilities: ['search', 'analysis'] }),
        'sess_001'
      )
      const b = hive.register(
        makeSpec({ capabilities: ['search', 'code_generation'] }),
        'sess_002'
      )
      const c = hive.register(
        makeSpec({ capabilities: ['code_generation'] }),
        'sess_003'
      )

      expect(hive.findByCapability('search')).toHaveLength(2)
      expect(hive.findByCapability('analysis')).toHaveLength(1)
      expect(hive.findByCapability('code_generation')).toHaveLength(2)
    })

    it('maintains index consistency after partial unregistration', () => {
      const hive = new Hive()
      const a = hive.register(
        makeSpec({ capabilities: ['search'] }),
        'sess_001'
      )
      const b = hive.register(
        makeSpec({ capabilities: ['search'] }),
        'sess_002'
      )

      hive.unregister(a.agentId)

      const found = hive.findByCapability('search')
      expect(found).toHaveLength(1)
      expect(found[0].agentId).toBe(b.agentId)
    })

    it('finds agents by capability after status changes', () => {
      const hive = new Hive()
      const a = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_001')
      hive.register(makeSpec({ capabilities: ['search'] }), 'sess_002')

      hive.markOffline(a.agentId)

      const all = hive.findByCapability('search')
      expect(all).toHaveLength(2)

      const active = hive.findByCapability('search', { activeOnly: true })
      expect(active).toHaveLength(1)
      expect(active[0].status).toBe('idle')
    })
  })
})
