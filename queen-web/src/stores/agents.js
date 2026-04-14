import { create } from 'zustand'

export const useAgentStore = create((set, get) => ({
  agents: [],
  agentStats: { idle: 0, busy: 0, error: 0, offline: 0 },

  setSnapshot (data) {
    set({
      agents: data.agents || [],
      agentStats: data.agentStats || { idle: 0, busy: 0, error: 0, offline: 0 }
    })
  },

  updateAgent (updated) {
    if (updated._removed) {
      set((state) => ({
        agents: state.agents.filter((a) => a.agentId !== updated.agentId),
        agentStats: recalcStats(
          state.agents.filter((a) => a.agentId !== updated.agentId)
        )
      }))
      return
    }

    set((state) => {
      const exists = state.agents.some((a) => a.agentId === updated.agentId)
      const agents = exists
        ? state.agents.map((a) => (a.agentId === updated.agentId ? { ...a, ...updated } : a))
        : [...state.agents, updated]
      return { agents, agentStats: recalcStats(agents) }
    })
  }
}))

function recalcStats (agents) {
  const stats = { idle: 0, busy: 0, error: 0, offline: 0 }
  for (const a of agents) {
    if (stats[a.status] !== undefined) stats[a.status]++
  }
  return stats
}
