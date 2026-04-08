import { describe, it, expect, beforeEach } from 'vitest'
import { useTaskStore } from '../../src/stores/tasks.js'

describe('useTaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      taskStats: { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 },
      taskLogs: {}
    })
  })

  describe('setSnapshot', () => {
    it('sets tasks and stats from snapshot', () => {
      useTaskStore.getState().setSnapshot({
        tasks: [
          { taskId: 't1', status: 'success' },
          { taskId: 't2', status: 'running' }
        ],
        taskStats: { pending: 0, running: 1, success: 1, failure: 0, partial: 0, cancelled: 0 }
      })

      const state = useTaskStore.getState()
      expect(state.tasks).toHaveLength(2)
      expect(state.taskStats.running).toBe(1)
      expect(state.taskStats.success).toBe(1)
    })

    it('handles missing fields with defaults', () => {
      useTaskStore.getState().setSnapshot({})
      const state = useTaskStore.getState()
      expect(state.tasks).toEqual([])
      expect(state.taskStats).toEqual({ pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 })
    })
  })

  describe('updateTask', () => {
    it('updates existing task', () => {
      useTaskStore.getState().setSnapshot({
        tasks: [{ taskId: 't1', status: 'running', progress: 0 }],
        taskStats: { pending: 0, running: 1, success: 0, failure: 0, partial: 0, cancelled: 0 }
      })

      useTaskStore.getState().updateTask({ taskId: 't1', status: 'success', progress: 100 })

      const state = useTaskStore.getState()
      expect(state.tasks[0].status).toBe('success')
      expect(state.tasks[0].progress).toBe(100)
      expect(state.taskStats.success).toBe(1)
      expect(state.taskStats.running).toBe(0)
    })

    it('adds new task if not exists', () => {
      useTaskStore.getState().updateTask({ taskId: 'new', status: 'pending' })

      const state = useTaskStore.getState()
      expect(state.tasks).toHaveLength(1)
      expect(state.tasks[0].taskId).toBe('new')
      expect(state.taskStats.pending).toBe(1)
    })

    it('recalculates stats on update', () => {
      useTaskStore.getState().setSnapshot({
        tasks: [
          { taskId: 't1', status: 'pending' },
          { taskId: 't2', status: 'pending' }
        ],
        taskStats: { pending: 2, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 }
      })

      useTaskStore.getState().updateTask({ taskId: 't1', status: 'running' })

      const state = useTaskStore.getState()
      expect(state.taskStats.pending).toBe(1)
      expect(state.taskStats.running).toBe(1)
    })
  })

  describe('addLog / getLogs', () => {
    it('adds and retrieves logs', () => {
      const entry = { taskId: 't1', source: 'queen', message: 'Task started', timestamp: Date.now() }
      useTaskStore.getState().addLog(entry)

      const logs = useTaskStore.getState().getLogs('t1')
      expect(logs).toHaveLength(1)
      expect(logs[0].message).toBe('Task started')
    })

    it('appends multiple logs for same task', () => {
      useTaskStore.getState().addLog({ taskId: 't1', source: 'queen', message: 'step 1', timestamp: 1 })
      useTaskStore.getState().addLog({ taskId: 't1', source: 'queen', message: 'step 2', timestamp: 2 })

      const logs = useTaskStore.getState().getLogs('t1')
      expect(logs).toHaveLength(2)
    })

    it('returns empty array for unknown task', () => {
      expect(useTaskStore.getState().getLogs('unknown')).toEqual([])
    })
  })
})
