/**
 * HeartbeatMonitor — 心跳监控服务
 *
 * 定时扫描 Hive 注册表，检测超时未心跳的 Agent，
 * 将其标记为 offline 并通过 Waggle 广播 agent.offline 事件。
 */

import { createMessageRecord } from '../models/message.js'

export class HeartbeatMonitor {
  /** @type {import('../core/hive.js').Hive} */
  #hive

  /** @type {import('../core/waggle.js').Waggle} */
  #waggle

  /** @type {number} 检查间隔（ms） */
  #intervalMs

  /** @type {number} 超时阈值（ms） */
  #timeoutMs

  /** @type {ReturnType<typeof setInterval>|null} */
  #timer = null

  /** @type {import('../utils/event-bus.js').EventBus | null} */
  #eventBus

  /**
   * @param {{
   *   hive: import('../core/hive.js').Hive,
   *   waggle: import('../core/waggle.js').Waggle,
   *   intervalMs?: number,
   *   timeoutMs?: number,
   *   eventBus?: import('../utils/event-bus.js').EventBus
   * }} options
   */
  constructor({ hive, waggle, intervalMs = 10000, timeoutMs = 30000, eventBus = null }) {
    this.#hive = hive
    this.#waggle = waggle
    this.#intervalMs = intervalMs
    this.#timeoutMs = timeoutMs
    this.#eventBus = eventBus
  }

  /**
   * 启动定时检查
   */
  start() {
    if (this.#timer) return
    this.#timer = setInterval(() => this.check(), this.#intervalMs)
  }

  /**
   * 停止定时检查
   */
  stop() {
    if (this.#timer) {
      clearInterval(this.#timer)
      this.#timer = null
    }
  }

  /**
   * 执行一次心跳检查
   *
   * @returns {string[]} 本次被标记 offline 的 agentId 列表
   */
  check() {
    const now = Date.now()
    const timedOut = []

    // 扫描 idle/busy/error 状态的 Agent（排除已 offline 的）
    for (const status of ['idle', 'busy', 'error']) {
      for (const agent of this.#hive.findByStatus(status)) {
        if (now - agent.lastHeartbeat > this.#timeoutMs) {
          timedOut.push(agent.agentId)
        }
      }
    }

    // 标记 offline 并广播事件
    for (const agentId of timedOut) {
      // 确认 Agent 仍在注册表中（可能已被其他流程注销）
      if (!this.#hive.has(agentId)) continue

      this.#hive.markOffline(agentId)
      const agent = this.#hive.get(agentId)
      this.#eventBus?.emit('agent.updated', agent)

      this.#waggle.broadcast(
        createMessageRecord({
          type: 'event',
          from: 'queen',
          payload: { event: 'agent.offline', agentId },
          priority: 2,
          ttl: 0
        })
      )
    }

    return timedOut
  }
}
