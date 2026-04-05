/**
 * Waggle 消息总线
 *
 * 基于"摇摆舞"通信模型的消息路由系统。
 * MVP 使用内存优先队列，接口设计为可替换（二期换 Redis 只改此文件）。
 *
 * @interface MessageBus
 * @method publish(agentId: string, message: Object): Promise<void>
 * @method subscribe(agentId: string, handler: Function): () => void
 * @method broadcast(message: Object): Promise<void>
 * @method drain(agentId: string): Object[]
 * @method purge(agentId: string): number
 */

import { ValidationError } from '../utils/errors.js'

/**
 * 内部优先级队列
 *
 * 使用排序数组实现。按 priority 升序（1=最高优先）排列，
 * 同优先级按 createdAt FIFO 排列。
 */
class PriorityQueue {
  /** @type {Array<{ message: Object, priority: number }>} */
  #items = []

  get size() {
    return this.#items.length
  }

  /**
   * @param {Object} message
   * @param {number} priority 1-5
   */
  push(message, priority) {
    this.#items.push({ message, priority })
    this.#items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.message.createdAt - b.message.createdAt
    })
  }

  /** @returns {Object|undefined} */
  pop() {
    const item = this.#items.shift()
    return item?.message
  }

  /** @returns {Object|undefined} */
  peek() {
    return this.#items[0]?.message
  }

  /** @returns {Object[]} */
  drain() {
    const items = this.#items.map(i => i.message)
    this.#items = []
    return items
  }

  clear() {
    this.#items = []
  }

  /**
   * 移除优先级最低（尾部）的消息
   * @returns {Object|undefined}
   */
  removeLowest() {
    const item = this.#items.pop()
    return item?.message
  }
}

export class Waggle {
  /** @type {Map<string, PriorityQueue>} */
  #queues = new Map()

  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map()

  /** @type {number} */
  #maxSize

  /**
   * @param {{ maxSize?: number }} [options]
   */
  constructor({ maxSize = 1000 } = {}) {
    this.#maxSize = maxSize
  }

  /**
   * 向指定 Agent 投递消息
   *
   * - 有订阅者：直接调用所有 handler
   * - 无订阅者：入队等待
   * - 过期消息静默丢弃
   *
   * @param {string} agentId
   * @param {Object} message
   * @returns {Promise<void>}
   */
  async publish(agentId, message) {
    if (this.#isExpired(message)) return

    const handlers = this.#handlers.get(agentId)
    if (handlers && handlers.size > 0) {
      await this.#dispatch(agentId, message)
    } else {
      const queue = this.#getOrCreateQueue(agentId)
      if (queue.size >= this.#maxSize) {
        queue.removeLowest()
      }
      queue.push(message, message.priority ?? 5)
    }
  }

  /**
   * 订阅指定 Agent 的消息
   *
   * 订阅后立即投递队列中积压的消息。
   * 返回取消订阅函数。
   *
   * @param {string} agentId
   * @param {Function} handler
   * @returns {() => void} 取消订阅函数
   */
  subscribe(agentId, handler) {
    if (typeof handler !== 'function') {
      throw new ValidationError('handler must be a function')
    }

    if (!this.#handlers.has(agentId)) {
      this.#handlers.set(agentId, new Set())
    }
    this.#handlers.get(agentId).add(handler)

    // 订阅时 drain 积压队列
    const queue = this.#queues.get(agentId)
    if (queue && queue.size > 0) {
      const pending = queue.drain()
      // 快照 handler 以防中途取消
      for (const msg of pending) {
        if (!this.#isExpired(msg)) {
          const currentHandlers = [...this.#handlers.get(agentId) ?? []]
          for (const h of currentHandlers) {
            try { h(msg) } catch { /* handler 错误隔离 */ }
          }
        }
      }
    }

    // 返回取消订阅函数
    return () => {
      const set = this.#handlers.get(agentId)
      if (set) {
        set.delete(handler)
        if (set.size === 0) {
          this.#handlers.delete(agentId)
        }
      }
    }
  }

  /**
   * 广播消息给所有已有队列/订阅者的 Agent
   *
   * @param {Object} message
   * @returns {Promise<void>}
   */
  async broadcast(message) {
    if (this.#isExpired(message)) return

    const allAgentIds = new Set([
      ...this.#handlers.keys(),
      ...this.#queues.keys()
    ])

    const promises = []
    for (const agentId of allAgentIds) {
      promises.push(this.publish(agentId, message))
    }

    await Promise.allSettled(promises)
  }

  /**
   * 取出指定 Agent 队列中的所有消息
   *
   * @param {string} agentId
   * @returns {Object[]}
   */
  drain(agentId) {
    const queue = this.#queues.get(agentId)
    if (!queue) return []
    const items = queue.drain()
    if (queue.size === 0) {
      this.#queues.delete(agentId)
    }
    return items
  }

  /**
   * 清除指定 Agent 的所有状态（队列 + handlers）
   *
   * @param {string} agentId
   * @returns {number} 被清除的排队消息数
   */
  purge(agentId) {
    const queue = this.#queues.get(agentId)
    const count = queue?.size ?? 0
    this.#queues.delete(agentId)
    this.#handlers.delete(agentId)
    return count
  }

  /**
   * 查询指定 Agent 的队列深度
   *
   * @param {string} agentId
   * @returns {number}
   */
  queueSize(agentId) {
    return this.#queues.get(agentId)?.size ?? 0
  }

  // ── 内部方法 ──────────────────────────────────

  /**
   * @param {Object} message
   * @returns {boolean}
   */
  #isExpired(message) {
    if (message.ttl == null || message.ttl <= 0) return false
    return Date.now() - message.createdAt > message.ttl
  }

  /**
   * @param {string} agentId
   * @returns {PriorityQueue}
   */
  #getOrCreateQueue(agentId) {
    if (!this.#queues.has(agentId)) {
      this.#queues.set(agentId, new PriorityQueue())
    }
    return this.#queues.get(agentId)
  }

  /**
   * 向指定 Agent 的所有 handler 投递消息
   *
   * @param {string} agentId
   * @param {Object} message
   * @returns {Promise<void>}
   */
  async #dispatch(agentId, message) {
    const handlers = this.#handlers.get(agentId)
    if (!handlers || handlers.size === 0) return

    // 快照以安全迭代
    const snapshot = [...handlers]
    const results = await Promise.allSettled(
      snapshot.map(h => {
        try {
          return Promise.resolve(h(message))
        } catch (err) {
          return Promise.reject(err)
        }
      })
    )

    // 记录 handler 错误但不传播
    for (const r of results) {
      if (r.status === 'rejected') {
        // 静默处理，不中断其他 handler
      }
    }
  }
}
