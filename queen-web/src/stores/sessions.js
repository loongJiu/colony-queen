/**
 * Zustand store — 工作会话状态管理
 */

import { create } from 'zustand'
import { apiFetch } from '../api/client'

export const useSessionStore = create((set, get) => ({
  sessions: [],
  currentSessionId: null,
  createDialogOpen: false,
  loading: false,
  error: null,

  async fetchSessions() {
    set({ loading: true, error: null })
    try {
      const data = await apiFetch('/session')
      set({ sessions: data?.sessions || data || [], loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  getSession(sessionId) {
    return get().sessions.find((s) => s.sessionId === sessionId)
  },

  async fetchSessionDetail(sessionId) {
    try {
      return await apiFetch(`/session/${sessionId}`)
    } catch {
      return null
    }
  },

  async createSession(title) {
    const data = await apiFetch('/session', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
    set((state) => ({
      sessions: [data, ...state.sessions],
      currentSessionId: data.sessionId,
    }))
    return data
  },

  async archiveSession(sessionId) {
    await apiFetch(`/session/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    })
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, status: 'archived' } : s
      ),
    }))
  },

  async addContext(sessionId, context) {
    const data = await apiFetch(`/session/${sessionId}/context`, {
      method: 'POST',
      body: JSON.stringify(context),
    })
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, ...data } : s
      ),
    }))
    return data
  },

  setCurrentSession(sessionId) {
    set({ currentSessionId: sessionId })
  },

  openCreateDialog() {
    set({ createDialogOpen: true })
  },

  closeCreateDialog() {
    set({ createDialogOpen: false })
  },
}))
