import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Waggle } from '../../src/core/waggle.js'
import { createMessageRecord } from '../../src/models/message.js'
import { ValidationError } from '../../src/utils/errors.js'

/**
 * 创建消息的辅助函数
 */
function makeMessage(overrides = {}) {
  return createMessageRecord({
    type: 'task_assign',
    from: 'queen',
    payload: { task: 'test' },
    ttl: 30000,
    ...overrides
  })
}

/**
 * 创建一个"已过期"的消息
 * 通过 mock Date.now 使消息在创建时就已经是过去的
 */
function makeExpiredMessage(overrides = {}) {
  const now = Date.now()
  const past = now - 100000
  const msg = createMessageRecord({
    type: 'task_assign',
    from: 'queen',
    payload: { task: 'test' },
    ttl: 1, // 1ms TTL
    ...overrides
  })
  // 返回可变副本，修改 createdAt
  return { ...msg, createdAt: past }
}

describe('Waggle', () => {
  // ── constructor ─────────────────────────────

  describe('constructor', () => {
    it('creates with default maxSize', () => {
      const waggle = new Waggle()
      expect(waggle.queueSize('any')).toBe(0)
    })

    it('creates with custom maxSize', () => {
      const waggle = new Waggle({ maxSize: 5 })
      expect(waggle.queueSize('any')).toBe(0)
    })
  })

  // ── publish ─────────────────────────────────

  describe('publish', () => {
    it('queues message when no subscriber', () => {
      const waggle = new Waggle()
      const msg = makeMessage()

      waggle.publish('agent_1', msg)

      expect(waggle.queueSize('agent_1')).toBe(1)
    })

    it('calls handler directly when subscriber exists', async () => {
      const waggle = new Waggle()
      const handler = vi.fn()
      const msg = makeMessage()

      waggle.subscribe('agent_1', handler)
      await waggle.publish('agent_1', msg)

      expect(handler).toHaveBeenCalledWith(msg)
      expect(waggle.queueSize('agent_1')).toBe(0)
    })

    it('calls all handlers for the same agent', async () => {
      const waggle = new Waggle()
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const msg = makeMessage()

      waggle.subscribe('agent_1', handler1)
      waggle.subscribe('agent_1', handler2)
      await waggle.publish('agent_1', msg)

      expect(handler1).toHaveBeenCalledWith(msg)
      expect(handler2).toHaveBeenCalledWith(msg)
    })

    it('silently discards expired messages', async () => {
      const waggle = new Waggle()
      const handler = vi.fn()
      const msg = makeExpiredMessage()

      waggle.subscribe('agent_1', handler)
      await waggle.publish('agent_1', msg)

      expect(handler).not.toHaveBeenCalled()
      expect(waggle.queueSize('agent_1')).toBe(0)
    })

    it('does not discard non-expired messages', async () => {
      const waggle = new Waggle()
      const msg = makeMessage({ ttl: 30000 })

      waggle.publish('agent_1', msg)

      expect(waggle.queueSize('agent_1')).toBe(1)
    })

    it('evicts lowest priority message when queue is full', () => {
      const waggle = new Waggle({ maxSize: 2 })

      // 入队两条消息
      waggle.publish('agent_1', makeMessage({ priority: 1 }))
      waggle.publish('agent_1', makeMessage({ priority: 5 }))

      expect(waggle.queueSize('agent_1')).toBe(2)

      // 第三条，优先级 2，应该驱逐最低优先级（5）的消息
      const highPriMsg = makeMessage({ priority: 2 })
      waggle.publish('agent_1', highPriMsg)

      expect(waggle.queueSize('agent_1')).toBe(2)

      // 队列中应该有优先级 1 和 2 的消息
      const drained = waggle.drain('agent_1')
      const priorities = drained.map(m => m.priority)
      expect(priorities).toContain(1)
      expect(priorities).toContain(2)
      expect(priorities).not.toContain(5)
    })

    it('queues messages for multiple agents independently', () => {
      const waggle = new Waggle()

      waggle.publish('agent_1', makeMessage())
      waggle.publish('agent_2', makeMessage())
      waggle.publish('agent_1', makeMessage())

      expect(waggle.queueSize('agent_1')).toBe(2)
      expect(waggle.queueSize('agent_2')).toBe(1)
    })

    it('handles handler errors without rejecting', async () => {
      const waggle = new Waggle()
      const badHandler = vi.fn(() => { throw new Error('boom') })
      const goodHandler = vi.fn()
      const msg = makeMessage()

      waggle.subscribe('agent_1', badHandler)
      waggle.subscribe('agent_1', goodHandler)

      // publish 不应因 handler 错误而 reject
      await expect(waggle.publish('agent_1', msg)).resolves.toBeUndefined()

      expect(badHandler).toHaveBeenCalled()
      expect(goodHandler).toHaveBeenCalled()
    })

    it('handles async handler rejection without rejecting publish', async () => {
      const waggle = new Waggle()
      const badHandler = vi.fn(() => Promise.reject(new Error('async boom')))
      const msg = makeMessage()

      waggle.subscribe('agent_1', badHandler)
      await expect(waggle.publish('agent_1', msg)).resolves.toBeUndefined()
    })
  })

  // ── subscribe ───────────────────────────────

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const waggle = new Waggle()
      const unsub = waggle.subscribe('agent_1', vi.fn())

      expect(typeof unsub).toBe('function')
    })

    it('removes handler when unsubscribe is called', async () => {
      const waggle = new Waggle()
      const handler = vi.fn()
      const msg = makeMessage()

      const unsub = waggle.subscribe('agent_1', handler)
      unsub()

      await waggle.publish('agent_1', msg)

      expect(handler).not.toHaveBeenCalled()
    })

    it('throws ValidationError for non-function handler', () => {
      const waggle = new Waggle()

      expect(() => waggle.subscribe('agent_1', 'not a function'))
        .toThrow(ValidationError)
    })

    it('drains pending queue on subscribe', () => {
      const waggle = new Waggle()
      const handler = vi.fn()

      // 先 publish 再 subscribe
      waggle.publish('agent_1', makeMessage({ priority: 2 }))
      waggle.publish('agent_1', makeMessage({ priority: 1 }))

      waggle.subscribe('agent_1', handler)

      expect(handler).toHaveBeenCalledTimes(2)
      // 按优先级顺序投递
      const calls = handler.mock.calls.map(c => c[0].priority)
      expect(calls).toEqual([1, 2])
    })

    it('does not drain expired messages on subscribe', () => {
      const waggle = new Waggle()
      const handler = vi.fn()

      const expiredMsg = makeExpiredMessage()
      waggle.publish('agent_1', expiredMsg)
      waggle.publish('agent_1', makeMessage({ ttl: 30000 }))

      waggle.subscribe('agent_1', handler)

      // 只投递未过期的那条
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].ttl).toBe(30000)
    })

    it('cleans up agent entry when last handler is removed', async () => {
      const waggle = new Waggle()
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      const unsub1 = waggle.subscribe('agent_1', handler1)
      waggle.subscribe('agent_1', handler2)

      unsub1()
      // handler2 还在，publish 应该调用它
      await waggle.publish('agent_1', makeMessage())
      expect(handler2).toHaveBeenCalledTimes(1)
    })
  })

  // ── broadcast ───────────────────────────────

  describe('broadcast', () => {
    it('delivers to all subscribed agents', async () => {
      const waggle = new Waggle()
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      waggle.subscribe('agent_1', handler1)
      waggle.subscribe('agent_2', handler2)

      const msg = makeMessage()
      await waggle.broadcast(msg)

      expect(handler1).toHaveBeenCalledWith(msg)
      expect(handler2).toHaveBeenCalledWith(msg)
    })

    it('queues to agents with existing queues but no handlers', async () => {
      const waggle = new Waggle()

      // agent_1 有队列（之前 publish 过），但无 handler
      waggle.publish('agent_1', makeMessage())

      const handler = vi.fn()
      waggle.subscribe('agent_2', handler)

      await waggle.broadcast(makeMessage())

      expect(handler).toHaveBeenCalledTimes(1)
      expect(waggle.queueSize('agent_1')).toBe(2) // 之前的 + 新广播的
    })

    it('silently does nothing when no subscribers or queues', async () => {
      const waggle = new Waggle()
      // 不应抛错
      await expect(waggle.broadcast(makeMessage())).resolves.toBeUndefined()
    })

    it('discards expired broadcast messages', async () => {
      const waggle = new Waggle()
      const handler = vi.fn()
      waggle.subscribe('agent_1', handler)

      const expiredMsg = makeExpiredMessage()
      await waggle.broadcast(expiredMsg)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  // ── drain ───────────────────────────────────

  describe('drain', () => {
    it('returns queued messages in priority order', () => {
      const waggle = new Waggle()

      waggle.publish('agent_1', makeMessage({ priority: 3 }))
      waggle.publish('agent_1', makeMessage({ priority: 1 }))
      waggle.publish('agent_1', makeMessage({ priority: 2 }))

      const drained = waggle.drain('agent_1')

      expect(drained).toHaveLength(3)
      expect(drained.map(m => m.priority)).toEqual([1, 2, 3])
    })

    it('empties the queue after drain', () => {
      const waggle = new Waggle()

      waggle.publish('agent_1', makeMessage())
      waggle.drain('agent_1')

      expect(waggle.queueSize('agent_1')).toBe(0)
    })

    it('returns empty array for unknown agent', () => {
      const waggle = new Waggle()
      expect(waggle.drain('unknown')).toEqual([])
    })

    it('does not affect handlers', async () => {
      const waggle = new Waggle()
      const handler = vi.fn()
      waggle.subscribe('agent_1', handler)

      waggle.publish('agent_1', makeMessage())
      waggle.drain('agent_1')

      // handler 仍在，下次 publish 还能收到
      await waggle.publish('agent_1', makeMessage())
      expect(handler).toHaveBeenCalledTimes(2) // 1次订阅时drain + 1次直接投递
    })
  })

  // ── purge ───────────────────────────────────

  describe('purge', () => {
    it('removes all queue and handler state for an agent', async () => {
      const waggle = new Waggle()
      const handler = vi.fn()

      waggle.subscribe('agent_1', handler)

      // subscribe 时已 drain，所以队列空。现在 publish 不入队（直接调 handler）
      // 取消订阅后再 publish 才会入队
      waggle.subscribe('agent_1', handler) // 再加一个 handler
      const unsub = waggle.subscribe('agent_1', () => {})
      unsub() // 移除这个，handler 还在

      // handler 还在，publish 会直接调用而不入队
      // 所以需要先取消所有 handler 再入队
      const unsubAll = waggle.subscribe('agent_1', handler)
      waggle.purge('agent_1') // 清除所有

      // 现在 publish 会入队
      waggle.publish('agent_1', makeMessage())
      waggle.publish('agent_1', makeMessage())

      const count = waggle.purge('agent_1')

      expect(count).toBe(2)
      expect(waggle.queueSize('agent_1')).toBe(0)

      // handler 已移除
      await waggle.publish('agent_1', makeMessage())
      // handler 不应该再被调用（只有之前的调用）
      expect(handler.mock.calls.length).toBeLessThanOrEqual(2)
    })

    it('returns 0 for unknown agent', () => {
      const waggle = new Waggle()
      expect(waggle.purge('unknown')).toBe(0)
    })

    it('does not affect other agents', async () => {
      const waggle = new Waggle()
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      waggle.subscribe('agent_1', handler1)
      waggle.subscribe('agent_2', handler2)

      waggle.purge('agent_1')

      await waggle.publish('agent_2', makeMessage())
      expect(handler2).toHaveBeenCalled()
    })
  })

  // ── queueSize ───────────────────────────────

  describe('queueSize', () => {
    it('returns 0 for unknown agent', () => {
      const waggle = new Waggle()
      expect(waggle.queueSize('unknown')).toBe(0)
    })

    it('returns correct count after publishes', () => {
      const waggle = new Waggle()

      waggle.publish('agent_1', makeMessage())
      waggle.publish('agent_1', makeMessage())
      waggle.publish('agent_1', makeMessage())

      expect(waggle.queueSize('agent_1')).toBe(3)
    })

    it('decreases after drain', () => {
      const waggle = new Waggle()

      waggle.publish('agent_1', makeMessage())
      waggle.publish('agent_1', makeMessage())
      waggle.drain('agent_1')

      expect(waggle.queueSize('agent_1')).toBe(0)
    })
  })

  // ── TTL ─────────────────────────────────────

  describe('TTL', () => {
    it('message with ttl=0 never expires', () => {
      const waggle = new Waggle()
      const msg = { ...makeMessage({ ttl: 0 }), createdAt: Date.now() - 100000 }

      waggle.publish('agent_1', msg)

      expect(waggle.queueSize('agent_1')).toBe(1)
    })

    it('message with undefined ttl never expires', () => {
      const waggle = new Waggle()
      const msg = { ...makeMessage(), ttl: undefined, createdAt: Date.now() - 100000 }

      waggle.publish('agent_1', msg)

      expect(waggle.queueSize('agent_1')).toBe(1)
    })

    it('message expires after createdAt + ttl', () => {
      const waggle = new Waggle()
      const msg = { ...makeMessage({ ttl: 100 }), createdAt: Date.now() - 200 }

      waggle.publish('agent_1', msg)

      expect(waggle.queueSize('agent_1')).toBe(0)
    })
  })
})
