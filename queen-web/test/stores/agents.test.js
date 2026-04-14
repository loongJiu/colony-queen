import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentStore } from '../../src/stores/agents.js'

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: [],
      agentStats: { idle: 0, busy: 0, error: 0, offline: 0 }
    })
  })

  describe('setSnapshot', () => {
    it('sets agents and stats from snapshot', () => {
      useAgentStore.getState().setSnapshot({
        agents: [
          { agentId: 'a1', status: 'idle' },
          { agentId: 'a2', status: 'busy' }
        ],
        agentStats: { idle: 1, busy: 1, error: 0, offline: 0 }
      })

      const state = useAgentStore.getState()
      expect(state.agents).toHaveLength(2)
      expect(state.agentStats.idle).toBe(1)
      expect(state.agentStats.busy).toBe(1)
    })

    it('handles missing fields with defaults', () => {
      useAgentStore.getState().setSnapshot({})
      const state = useAgentStore.getState()
      expect(state.agents).toEqual([])
      expect(state.agentStats).toEqual({ idle: 0, busy: 0, error: 0, offline: 0 })
    })
  })

  describe('updateAgent', () => {
    it('updates existing agent', () => {
      useAgentStore.getState().setSnapshot({
        agents: [{ agentId: 'a1', status: 'idle', capabilities: ['search'] }],
        agentStats: { idle: 1, busy: 0, error: 0, offline: 0 }
      })

      useAgentStore.getState().updateAgent({ agentId: 'a1', status: 'busy' })

      const state = useAgentStore.getState()
      expect(state.agents[0].status).toBe('busy')
      expect(state.agents[0].capabilities).toEqual(['search'])
      expect(state.agentStats.busy).toBe(1)
      expect(state.agentStats.idle).toBe(0)
    })

    it('adds new agent if not exists', () => {
      useAgentStore.getState().updateAgent({ agentId: 'new', status: 'idle' })

      const state = useAgentStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].agentId).toBe('new')
      expect(state.agentStats.idle).toBe(1)
    })

    it('removes agent when _removed is true', () => {
      useAgentStore.getState().setSnapshot({
        agents: [
          { agentId: 'a1', status: 'idle' },
          { agentId: 'a2', status: 'busy' }
        ],
        agentStats: { idle: 1, busy: 1, error: 0, offline: 0 }
      })

      useAgentStore.getState().updateAgent({ agentId: 'a1', _removed: true })

      const state = useAgentStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].agentId).toBe('a2')
      expect(state.agentStats.idle).toBe(0)
    })
  })
})
