import { create } from 'zustand'

export const useTaskStore = create((set) => ({
  tasks: [],
  taskStats: { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 },

  setSnapshot (data) {
    set({
      tasks: data.tasks || [],
      taskStats: data.taskStats || { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 }
    })
  },

  updateTask (updated) {
    set((state) => {
      const exists = state.tasks.some((t) => t.taskId === updated.taskId)
      const tasks = exists
        ? state.tasks.map((t) => (t.taskId === updated.taskId ? { ...t, ...updated } : t))
        : [...state.tasks, updated]
      return { tasks, taskStats: recalcTaskStats(tasks) }
    })
  }
}))

function recalcTaskStats (tasks) {
  const stats = { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 }
  for (const t of tasks) {
    if (stats[t.status] !== undefined) stats[t.status]++
  }
  return stats
}
