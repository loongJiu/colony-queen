/**
 * EventBus — 轻量事件总线
 *
 * 基于 Node.js EventEmitter，为 SSE 推送和内部解耦服务。
 * emit() 同时触发 'event' 通配事件（SSE 订阅用）和具名事件。
 */

import { EventEmitter } from 'events'

export class EventBus extends EventEmitter {
  constructor () {
    super()
    // 不限制监听器数量（SSE 客户端可能较多）
    this.setMaxListeners(50)
  }

  /**
   * 发射事件
   *
   * 同时触发：
   * - 'event' 通配事件：{ type, data, timestamp }
   * - 具名事件：data
   *
   * @param {string} type - 事件类型，如 'task.updated'、'agent.updated'
   * @param {Object} data - 事件数据
   * @returns {boolean}
   */
  emit (type, data) {
    const envelope = { type, data, timestamp: Date.now() }
    super.emit('event', envelope)
    return super.emit(type, envelope)
  }
}
