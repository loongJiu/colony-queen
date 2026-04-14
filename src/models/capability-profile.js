/**
 * CapabilityProfile 数据模型
 *
 * 记录 Agent 在各能力维度上的历史表现画像。
 * 用于 Scheduler v3.0 的加权调度决策。
 */

import { ValidationError } from '../utils/errors.js'

export const VALID_TRENDS = ['improving', 'stable', 'declining']

/**
 * 能力画像记录（不可变）
 *
 * @typedef {Object} CapabilityProfile
 * @property {string}   agentId              - Agent ID
 * @property {string}   capability           - 能力标签
 * @property {number}   declaredConfidence   - 来自 bee.yaml 的声明置信度 0.0-1.0
 * @property {number}   actualScore          - 历史实际得分（EMA）0.0-1.0
 * @property {number}   taskCount            - 执行过的任务数
 * @property {number}   successRate          - 成功率 0.0-1.0
 * @property {number}   avgDuration          - 平均耗时 ms
 * @property {Object}   specializations      - 子领域细分
 * @property {'improving'|'stable'|'declining'} recentTrend - 近期趋势
 * @property {number}   updatedAt            - 更新时间戳
 */

/**
 * 创建不可变的 CapabilityProfile
 *
 * @param {Object} params
 * @param {string} params.agentId
 * @param {string} params.capability
 * @param {number} [params.declaredConfidence=0.5]
 * @param {number} [params.actualScore=0.5]
 * @param {number} [params.taskCount=0]
 * @param {number} [params.successRate=0.5]
 * @param {number} [params.avgDuration=0]
 * @param {Object} [params.specializations={}]
 * @param {'improving'|'stable'|'declining'} [params.recentTrend='stable']
 * @param {number} [params.updatedAt]
 * @returns {CapabilityProfile}
 * @throws {ValidationError} 参数校验失败
 */
export function createCapabilityProfile(params) {
  const {
    agentId,
    capability,
    declaredConfidence = 0.5,
    actualScore = 0.5,
    taskCount = 0,
    successRate = 0.5,
    avgDuration = 0,
    specializations = {},
    recentTrend = 'stable',
    updatedAt
  } = params

  if (!agentId) {
    throw new ValidationError('agentId is required')
  }

  if (!capability) {
    throw new ValidationError('capability is required')
  }

  if (typeof declaredConfidence !== 'number' || declaredConfidence < 0 || declaredConfidence > 1) {
    throw new ValidationError('declaredConfidence must be a number between 0.0 and 1.0')
  }

  if (typeof actualScore !== 'number' || actualScore < 0 || actualScore > 1) {
    throw new ValidationError('actualScore must be a number between 0.0 and 1.0')
  }

  if (!Number.isInteger(taskCount) || taskCount < 0) {
    throw new ValidationError('taskCount must be a non-negative integer')
  }

  if (typeof successRate !== 'number' || successRate < 0 || successRate > 1) {
    throw new ValidationError('successRate must be a number between 0.0 and 1.0')
  }

  if (typeof avgDuration !== 'number' || avgDuration < 0) {
    throw new ValidationError('avgDuration must be a non-negative number')
  }

  if (!VALID_TRENDS.includes(recentTrend)) {
    throw new ValidationError(
      `Invalid recentTrend "${recentTrend}", must be one of: ${VALID_TRENDS.join(', ')}`
    )
  }

  const record = {
    agentId,
    capability,
    declaredConfidence,
    actualScore,
    taskCount,
    successRate,
    avgDuration,
    specializations,
    recentTrend,
    updatedAt: updatedAt ?? Date.now()
  }

  return Object.freeze(record)
}

/**
 * 使用 EMA（指数移动平均）更新 actualScore
 *
 * @param {number} currentScore - 当前得分
 * @param {number} newScore - 新得分
 * @param {number} [alpha=0.1] - 学习率
 * @returns {number} 更新后的得分，clamp 到 [0, 1]
 */
export function emaUpdate(currentScore, newScore, alpha = 0.1) {
  const updated = currentScore * (1 - alpha) + newScore * alpha
  return Math.max(0, Math.min(1, updated))
}

/**
 * 计算近期趋势
 *
 * 比较最近 N 次和更早 M 次的平均得分，判断趋势方向。
 *
 * @param {number[]} recentScores - 最近的得分列表（已按时间正序排列）
 * @param {Object} [options]
 * @param {number} [options.recentWindow=10] - 近期窗口大小
 * @param {number} [options.baselineWindow=50] - 基线窗口大小
 * @param {number} [options.threshold=0.05] - 判定阈值
 * @returns {'improving'|'stable'|'declining'}
 */
export function computeTrend(recentScores, options = {}) {
  const { recentWindow = 10, baselineWindow = 50, threshold = 0.05 } = options

  if (recentScores.length < recentWindow) return 'stable'

  const recent = recentScores.slice(-recentWindow)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length

  // 基线：用 recentWindow 之前的数据
  const baseline = recentScores.slice(-baselineWindow, -recentWindow)
  if (baseline.length < 3) return 'stable'

  const baselineAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length

  const diff = recentAvg - baselineAvg
  if (diff > threshold) return 'improving'
  if (diff < -threshold) return 'declining'
  return 'stable'
}
