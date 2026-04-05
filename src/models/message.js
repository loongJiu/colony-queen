/**
 * Message 数据模型
 *
 * 定义 MessageRecord 类型及工厂函数，
 * 用于 Waggle 消息总线的消息传递。
 */

import { genMessageId } from '../utils/id.js'
import { ValidationError } from '../utils/errors.js'

const VALID_TYPES = ['task_assign', 'task_cancel', 'task_result', 'heartbeat', 'command', 'event']
const VALID_PRIORITIES = [1, 2, 3, 4, 5] // 1=最高优先级, 5=最低优先级

/**
 * 消息记录
 *
 * @typedef {Object} MessageRecord
 * @property {string}   messageId       - 唯一 ID (msg_{ts}_{rand4})
 * @property {string}   type            - 消息类型
 * @property {string}   from            - 发送者 agentId（或 'queen'）
 * @property {string}   [to]            - 目标 agentId（广播消息无）
 * @property {*}        payload         - 消息体，任意可序列化数据
 * @property {number}   priority        - 优先级 1(最高) - 5(最低)
 * @property {number}   ttl             - 生存时间（毫秒），0 表示永不过期
 * @property {number}   createdAt       - 创建时间戳
 * @property {string}   [correlationId] - 关联 ID，用于请求-响应模式
 */

/**
 * 创建不可变的 MessageRecord
 *
 * @param {Object} params
 * @param {string} params.type            - 消息类型
 * @param {string} params.from            - 发送者 agentId
 * @param {*}      params.payload         - 消息体
 * @param {string} [params.to]            - 接收者 agentId
 * @param {number} [params.priority]      - 优先级 1-5，默认 5
 * @param {number} [params.ttl]           - 生存时间(ms)，默认 30000
 * @param {string} [params.correlationId] - 关联 ID
 * @returns {MessageRecord}
 * @throws {ValidationError} type 无效或 priority 超出范围
 */
export function createMessageRecord({ type, from, payload, to, priority, ttl, correlationId }) {
  if (!type || !VALID_TYPES.includes(type)) {
    throw new ValidationError(
      `Invalid type "${type}", must be one of: ${VALID_TYPES.join(', ')}`
    )
  }

  if (priority != null && !VALID_PRIORITIES.includes(priority)) {
    throw new ValidationError(
      `Invalid priority "${priority}", must be one of: ${VALID_PRIORITIES.join(', ')}`
    )
  }

  const record = {
    messageId: genMessageId(),
    type,
    from,
    payload,
    priority: priority ?? 5,
    ttl: ttl ?? 30000,
    createdAt: Date.now(),
    ...(to != null && { to }),
    ...(correlationId != null && { correlationId })
  }

  return Object.freeze(record)
}

export { VALID_TYPES, VALID_PRIORITIES }
