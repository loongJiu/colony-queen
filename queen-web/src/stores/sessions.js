/**
 * Zustand store — 工作会话状态管理
 */

import { create } from 'zustand'
import { apiFetch } from '../api/client'

export const useSessionStore = create((set, get) => ({
  sessions: [],
  loading: false,
  error: null,

  async fetchSessions () {
    set({ loading: true, error: null })
    try {
      const data = await apiFetch('/session')
      set({ sessions: data || [], loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  getSession (sessionId) {
    return get().sessions.find((s) => s.sessionId === sessionId)
  }
}))
