import { create } from 'zustand'

export const useConnectionStore = create((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected })
}))
