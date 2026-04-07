import { create } from 'zustand'

export const useTaskStore = create((set, get) => ({
  tasks: [],
  taskStats: { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 },
  // 任务日志：{ taskId: LogEntry[] }
  taskLogs: {},

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
  },

  /**
   * 添加实时日志条目
   * @param {{ taskId: string, source: string, message: string, timestamp: number }} logEntry
   */
  addLog (logEntry) {
    set((state) => {
      const { taskId } = logEntry
      const logs = state.taskLogs[taskId] || []
      return {
        taskLogs: {
          ...state.taskLogs,
          [taskId]: [...logs, logEntry]
        }
      }
    })
  },

  /**
   * 获取指定任务的日志
   * @param {string} taskId
   * @returns {Array}
   */
  getLogs (taskId) {
    return get().taskLogs[taskId] || []
  }
}))

function recalcTaskStats (tasks) {
  const stats = { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 }
  for (const t of tasks) {
    if (stats[t.status] !== undefined) stats[t.status]++
  }
  return stats
}
