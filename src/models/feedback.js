/**
 * Feedback 数据模型
 *
 * 定义 FeedbackRecord 类型及工厂函数，
 * 用于任务反馈数据的创建与流转。
 */

import { genId } from '../utils/id.js'
import { ValidationError } from '../utils/errors.js'

export const VALID_FEEDBACK_SOURCES = ['auto', 'user']

/**
 * 反馈记录（不可变）
 *
 * @typedef {Object} FeedbackRecord
 * @property {string}   feedbackId       - fb_{ts}_{rand4}
 * @property {string}   taskId           - 关联的任务 ID
 * @property {string}   conversationId   - 关联的会话 ID
 * @property {string}   agentId          - 执行 Agent ID
 * @property {string}   capability       - 任务能力标签
 * @property {'auto'|'user'} source      - 反馈来源
 * @property {number|null} [userScore]   - 用户评分 1-5，auto 来源为 null
 * @property {number}     [autoScore]    - 自动评分 0.0-1.0，user 来源可为 undefined
 * @property {number}     [finalScore]   - 综合评分
 * @property {string}     [userComment]  - 用户评语
 * @property {Object[]}   [corrections]  - 修正建议列表
 * @property {Object}     [taskContext]  - 任务上下文快照
 * @property {number}   createdAt        - 创建时间戳
 */

/**
 * 创建不可变的 FeedbackRecord
 *
 * @param {Object} params
 * @param {string} params.taskId - 关联的任务 ID
 * @param {string} params.conversationId - 关联的会话 ID
 * @param {string} params.agentId - 执行 Agent ID
 * @param {string} params.capability - 任务能力标签
 * @param {'auto'|'user'} params.source - 反馈来源
 * @param {number|null} [params.userScore] - 用户评分 1-5
 * @param {number} [params.autoScore] - 自动评分 0.0-1.0
 * @param {number} [params.finalScore] - 综合评分
 * @param {string} [params.userComment] - 用户评语
 * @param {Object[]} [params.corrections] - 修正建议列表
 * @param {Object} [params.taskContext] - 任务上下文快照
 * @returns {FeedbackRecord}
 * @throws {ValidationError} taskId 为空或 source 无效或评分越界
 */
export function createFeedbackRecord(params) {
  const {
    taskId,
    conversationId,
    agentId,
    capability,
    source,
    userScore,
    autoScore,
    finalScore,
    userComment,
    corrections,
    taskContext
  } = params

  if (!taskId) {
    throw new ValidationError('taskId is required')
  }

  if (!conversationId) {
    throw new ValidationError('conversationId is required')
  }

  if (!agentId) {
    throw new ValidationError('agentId is required')
  }

  if (!capability) {
    throw new ValidationError('capability is required')
  }

  if (!source || !VALID_FEEDBACK_SOURCES.includes(source)) {
    throw new ValidationError(
      `Invalid source "${source}", must be one of: ${VALID_FEEDBACK_SOURCES.join(', ')}`
    )
  }

  if (source === 'user' && userScore != null) {
    if (!Number.isInteger(userScore) || userScore < 1 || userScore > 5) {
      throw new ValidationError('userScore must be an integer between 1 and 5')
    }
  }

  if (autoScore != null) {
    if (typeof autoScore !== 'number' || autoScore < 0 || autoScore > 1) {
      throw new ValidationError('autoScore must be a number between 0.0 and 1.0')
    }
  }

  const record = {
    feedbackId: genId('fb'),
    taskId,
    conversationId,
    agentId,
    capability,
    source,
    ...(userScore != null && { userScore }),
    ...(autoScore != null && { autoScore }),
    ...(finalScore != null && { finalScore }),
    ...(userComment != null && { userComment }),
    ...(corrections != null && { corrections }),
    ...(taskContext != null && { taskContext }),
    createdAt: Date.now()
  }

  return Object.freeze(record)
}
