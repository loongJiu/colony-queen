/**
 * WorkSession 数据模型
 *
 * 定义 WorkSessionRecord 类型及工厂函数，
 * 用于管理同一工作会话下多任务的上下文共享。
 */

import { genId } from '../utils/id.js'
import { ValidationError } from '../utils/errors.js'

export const VALID_SESSION_STATUSES = ['active', 'archived']

/**
 * 工作会话记录（不可变）
 *
 * @typedef {Object} WorkSessionRecord
 * @property {string}   sessionId        - wsess_{ts}_{rand4}
 * @property {string}   title            - 会话标题
 * @property {string[]} conversationIds  - 关联的 conversationId 列表
 * @property {Object}   keyOutputs       - { [conversationId]: { type, summary } }
 * @property {Object}   sharedContext    - 用户显式共享的上下文
 * @property {'active'|'archived'} status - 会话状态
 * @property {number}   createdAt        - 创建时间戳
 * @property {number}   updatedAt        - 更新时间戳
 */

/**
 * 创建不可变的 WorkSessionRecord
 *
 * @param {Object} params
 * @param {string} [params.sessionId]     - 指定 ID（通常自动生成）
 * @param {string} params.title           - 会话标题
 * @param {string[]} [params.conversationIds] - 关联的 conversationId 列表
 * @param {Object} [params.keyOutputs]    - 各对话的关键产出
 * @param {Object} [params.sharedContext] - 用户共享上下文
 * @param {'active'|'archived'} [params.status='active'] - 会话状态
 * @returns {WorkSessionRecord}
 * @throws {ValidationError} title 为空或 status 无效
 */
export function createWorkSessionRecord(params) {
  const {
    sessionId,
    title,
    conversationIds = [],
    keyOutputs = {},
    sharedContext = {},
    status = 'active'
  } = params

  if (!title || typeof title !== 'string') {
    throw new ValidationError('title is required and must be a non-empty string')
  }

  if (!VALID_SESSION_STATUSES.includes(status)) {
    throw new ValidationError(
      `Invalid status "${status}", must be one of: ${VALID_SESSION_STATUSES.join(', ')}`
    )
  }

  const now = Date.now()
  const record = {
    sessionId: sessionId || genId('wsess'),
    title,
    conversationIds: [...conversationIds],
    keyOutputs: { ...keyOutputs },
    sharedContext: { ...sharedContext },
    status,
    createdAt: now,
    updatedAt: now
  }

  return Object.freeze(record)
}
