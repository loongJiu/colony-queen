import { create } from 'zustand'

export const useTaskStore = create((set, get) => ({
  tasks: [],
  taskStats: { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 },
  // 任务日志：{ taskId: LogEntry[] }
  taskLogs: {},
  // 当前选中的任务详情（通过 API 获取的完整数据）
  selectedTask: null,

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

      // 如果当前选中的任务被更新，同步更新 selectedTask
      const selectedTask = state.selectedTask?.taskId === updated.taskId
        ? { ...state.selectedTask, ...updated }
        : state.selectedTask

      return { tasks, taskStats: recalcTaskStats(tasks), selectedTask }
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
  },

  /**
   * 设置当前选中的任务详情
   * @param {Object|null} task
   */
  setSelectedTask (task) {
    set({ selectedTask: task })
  }
}))

function recalcTaskStats (tasks) {
  const stats = { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 }
  for (const t of tasks) {
    if (stats[t.status] !== undefined) stats[t.status]++
  }
  return stats
}
