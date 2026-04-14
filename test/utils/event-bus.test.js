/**
 * EventBus 单元测试
 */

import { describe, it, expect } from 'vitest'
import { EventBus } from '../../src/utils/event-bus.js'

describe('EventBus', () => {
  it('emit 触发通配 event 事件', () => {
    const bus = new EventBus()
    const events = []

    bus.on('event', (envelope) => events.push(envelope))

    bus.emit('task.updated', { taskId: 't1', status: 'running' })

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('task.updated')
    expect(events[0].data).toEqual({ taskId: 't1', status: 'running' })
    expect(events[0].timestamp).toBeTypeOf('number')
  })

  it('emit 同时触发具名事件', () => {
    const bus = new EventBus()
    const taskEvents = []

    bus.on('task.updated', (envelope) => taskEvents.push(envelope))

    bus.emit('task.updated', { taskId: 't1' })

    expect(taskEvents).toHaveLength(1)
    expect(taskEvents[0].type).toBe('task.updated')
    expect(taskEvents[0].data).toEqual({ taskId: 't1' })
  })

  it('多个监听器同时接收事件', () => {
    const bus = new EventBus()
    const a = []
    const b = []

    bus.on('event', (e) => a.push(e))
    bus.on('event', (e) => b.push(e))

    bus.emit('agent.updated', { agentId: 'a1' })

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('off 取消订阅后不再接收事件', () => {
    const bus = new EventBus()
    const events = []

    const handler = (e) => events.push(e)
    bus.on('event', handler)
    bus.emit('test', { v: 1 })

    bus.off('event', handler)
    bus.emit('test', { v: 2 })

    expect(events).toHaveLength(1)
    expect(events[0].data).toEqual({ v: 1 })
  })

  it('不同类型事件互不干扰', () => {
    const bus = new EventBus()
    const taskEvents = []
    const agentEvents = []

    bus.on('task.updated', (e) => taskEvents.push(e))
    bus.on('agent.updated', (e) => agentEvents.push(e))

    bus.emit('task.updated', { taskId: 't1' })
    bus.emit('agent.updated', { agentId: 'a1' })

    expect(taskEvents).toHaveLength(1)
    expect(agentEvents).toHaveLength(1)
  })
})
