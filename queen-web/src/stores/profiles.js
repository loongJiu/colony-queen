/**
 * Zustand store — Agent 能力画像状态管理
 */

import { create } from 'zustand'
import { apiFetch } from '../api/client'

export const useProfileStore = create((set, get) => ({
  profiles: [],
  profileDetail: null,
  stats: { successRate: 0, avgScore: 0 },
  loading: false,
  error: null,

  async fetchProfiles () {
    set({ loading: true, error: null })
    try {
      const data = await apiFetch('/admin/profiles')
      set({ profiles: data?.profiles || [], loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  async fetchProfile (agentId) {
    set({ loading: true, error: null, profileDetail: null })
    try {
      const data = await apiFetch(`/admin/profiles/${agentId}`)
      set({ profileDetail: data, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  async fetchStats () {
    try {
      const data = await apiFetch('/admin/stats')
      set({ stats: data || {} })
    } catch (err) {
      // silently fail for stats
    }
  }
}))
