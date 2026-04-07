/**
 * SSE Stream Handler 集成测试
 *
 * 验证 SSE 端点：
 * 1. 连接后立即推送 snapshot
 * 2. EventBus 事件实时推送到客户端
 * 3. raw.destroyed 时不推送
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from '../../src/utils/event-bus.js'
import streamRoutes from '../../src/handlers/stream.js'

function createSSEMock () {
  const events = []

  const raw = {
    destroyed: false,
    headers: {},
    setHeader (k, v) { this.headers[k] = v },
    flushHeaders () {},
    write (data) {
      if (this.destroyed) return
      const lines = data.split('\n')
      let eventType = ''
      let eventData = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7)
        if (line.startsWith('data: ')) eventData = line.slice(6)
        if (line.startsWith(': ')) {
          events.push({ type: 'keep-alive', data: null })
        }
      }
      if (eventType && eventData) {
        events.push({ type: eventType, data: JSON.parse(eventData) })
      }
    }
  }

  let closeHandler = null

  return {
    events,
    raw,
    req: {
      log: { info () {}, child () { return { info () {} } } },
      ip: '127.0.0.1',
      raw: {
        on (event, handler) {
          if (event === 'close') closeHandler = handler
        }
      }
    },
    createReply () {
      return { raw, code () { return this }, send () { return this }, status () { return this } }
    },
    // 触发 close 事件以结束 SSE 连接
    disconnect () {
      raw.destroyed = true
      closeHandler?.()
    }
  }
}

function setupHandler (eventBus, hive, executor) {
  const app = { get (path, fn) { this._handler = fn }, _handler: null }
  streamRoutes(app, { hive, executor, eventBus })
  return app
}

describe('SSE Stream Handler', () => {
  let eventBus, hive, executor

  beforeEach(() => {
    eventBus = new EventBus()
    hive = {
      listAll: () => [
        { agentId: 'a1', name: 'Worker-1', status: 'idle', capabilities: ['search'] },
        { agentId: 'a2', name: 'Worker-2', status: 'busy', capabilities: ['code_gen'] }
      ]
    }
    executor = {
      listTasks: () => [
        { taskId: 't1', status: 'running' },
        { taskId: 't2', status: 'success' }
      ]
    }
  })

  it('连接后立即推送 snapshot 事件', async () => {
    const mock = createSSEMock()
    const app = setupHandler(eventBus, hive, executor)

    // 不 await — handler 永不 resolve
    app._handler(mock.req, mock.createReply())
    await new Promise((r) => setTimeout(r, 10))

    expect(mock.raw.headers['Content-Type']).toBe('text/event-stream')
    expect(mock.raw.headers['Cache-Control']).toBe('no-cache')

    const snapshots = mock.events.filter((e) => e.type === 'snapshot')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].data.agents).toHaveLength(2)
    expect(snapshots[0].data.tasks).toHaveLength(2)
  })

  it('EventBus 事件被推送到 SSE 客户端', async () => {
    const mock = createSSEMock()
    const app = setupHandler(eventBus, hive, executor)

    app._handler(mock.req, mock.createReply())
    await new Promise((r) => setTimeout(r, 10))

    eventBus.emit('agent.updated', { agentId: 'a1', status: 'busy' })
    eventBus.emit('task.updated', { taskId: 't1', status: 'success' })
    await new Promise((r) => setTimeout(r, 10))

    const agentEvents = mock.events.filter((e) => e.type === 'agent.updated')
    const taskEvents = mock.events.filter((e) => e.type === 'task.updated')

    expect(agentEvents).toHaveLength(1)
    expect(agentEvents[0].data.agentId).toBe('a1')
    expect(taskEvents).toHaveLength(1)
    expect(taskEvents[0].data.taskId).toBe('t1')
  })

  it('snapshot 包含正确的统计数据', async () => {
    const mock = createSSEMock()
    const app = setupHandler(eventBus, hive, executor)

    app._handler(mock.req, mock.createReply())
    await new Promise((r) => setTimeout(r, 10))

    const snapshot = mock.events.find((e) => e.type === 'snapshot')
    expect(snapshot.data.agentStats).toEqual({ idle: 1, busy: 1, error: 0, offline: 0 })
    expect(snapshot.data.taskStats).toEqual({ pending: 0, running: 1, success: 1, failure: 0, partial: 0, cancelled: 0 })
  })

  it('raw.destroyed 时不推送事件', async () => {
    const mock = createSSEMock()
    const app = setupHandler(eventBus, hive, executor)

    app._handler(mock.req, mock.createReply())
    await new Promise((r) => setTimeout(r, 10))

    const countBefore = mock.events.length
    mock.raw.destroyed = true

    eventBus.emit('task.updated', { taskId: 't1', status: 'cancelled' })
    await new Promise((r) => setTimeout(r, 10))

    expect(mock.events).toHaveLength(countBefore)
  })
})
