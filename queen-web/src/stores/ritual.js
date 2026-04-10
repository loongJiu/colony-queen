import { create } from 'zustand'

export const useRitualStore = create((set) => ({
  active: false,
  variant: 'dispatch',
  message: '',
  timestamp: 0,

  triggerRitual: ({ variant, message }) => {
    const now = Date.now()
    // 如果仪式正在进行且不到 2 秒前才触发，忽略重复
    const state = useRitualStore.getState()
    if (state.active && now - state.timestamp < 2000) return

    set({ active: true, variant, message, timestamp: now })
  },

  clearRitual: () => set({
    active: false,
    variant: 'dispatch',
    message: '',
    timestamp: 0,
  }),
}))
