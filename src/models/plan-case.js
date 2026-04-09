/**
 * PlanCase 数据模型
 *
 * 记录成功的规划案例，供 LLM Planner 作为 few-shot 学习素材复用。
 * 每条 PlanCase 包含原始任务描述、生成的规划方案、评分和复用统计。
 */

import { genId } from '../utils/id.js'
import { ValidationError } from '../utils/errors.js'

export const VALID_PLAN_CASE_STATUSES = ['pending', 'confirmed', 'discarded']

/**
 * 规划案例记录（不可变）
 *
 * @typedef {Object} PlanCaseRecord
 * @property {string}   caseId           - pc_{ts}_{rand4}
 * @property {string}   inputHash        - 输入文本的哈希，用于快速去重
 * @property {string}   inputText        - 原始任务描述
 * @property {string}   plan             - JSON.stringify(plan) 规划方案
 * @property {number}   score            - 综合评分 0.0-1.0
 * @property {number}   usedCount        - 被复用次数
 * @property {'pending'|'confirmed'|'discarded'} status - 案例状态
 * @property {number}   createdAt        - 创建时间戳
 * @property {number}   updatedAt        - 更新时间戳
 */

/**
 * 计算输入文本的简单哈希（用于去重）
 *
 * MVP 使用 djb2 算法，后续可升级为更可靠的哈希。
 *
 * @param {string} text
 * @returns {string}
 */
export function computeInputHash(text) {
  if (!text || typeof text !== 'string') {
    throw new ValidationError('inputText must be a non-empty string')
  }
  const normalized = text.trim().toLowerCase()
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) & 0x7fffffff
  }
  return hash.toString(36)
}

/**
 * 创建不可变的 PlanCaseRecord
 *
 * @param {Object} params
 * @param {string} params.inputText  - 原始任务描述
 * @param {Object} params.plan       - 规划方案对象（将被 JSON.stringify）
 * @param {number} [params.score=0]  - 综合评分 0.0-1.0
 * @param {number} [params.usedCount=0] - 被复用次数
 * @param {'pending'|'confirmed'|'discarded'} [params.status='pending'] - 案例状态
 * @returns {PlanCaseRecord}
 * @throws {ValidationError} 参数校验失败
 */
export function createPlanCaseRecord(params) {
  const {
    inputText,
    plan,
    score = 0,
    usedCount = 0,
    status = 'pending'
  } = params

  if (!inputText || typeof inputText !== 'string') {
    throw new ValidationError('inputText is required and must be a non-empty string')
  }

  if (plan === undefined || plan === null) {
    throw new ValidationError('plan is required')
  }

  if (typeof score !== 'number' || score < 0 || score > 1) {
    throw new ValidationError('score must be a number between 0.0 and 1.0')
  }

  if (!Number.isInteger(usedCount) || usedCount < 0) {
    throw new ValidationError('usedCount must be a non-negative integer')
  }

  if (!VALID_PLAN_CASE_STATUSES.includes(status)) {
    throw new ValidationError(
      `Invalid status "${status}", must be one of: ${VALID_PLAN_CASE_STATUSES.join(', ')}`
    )
  }

  const now = Date.now()
  const record = {
    caseId: genId('pc'),
    inputHash: computeInputHash(inputText),
    inputText,
    plan: typeof plan === 'string' ? plan : JSON.stringify(plan),
    score,
    usedCount,
    status,
    createdAt: now,
    updatedAt: now
  }

  return Object.freeze(record)
}
