/**
 * ProfileUpdater — Agent 能力画像更新服务
 *
 * 基于任务反馈（FeedbackRecord）自动更新 Agent 的 CapabilityProfile。
 * 使用指数移动平均（EMA）平滑实际得分，避免单次异常影响画像稳定性。
 */

import { createCapabilityProfile, emaUpdate, computeTrend } from '../models/capability-profile.js'

/** 默认 EMA 学习率 */
const DEFAULT_ALPHA = 0.1

export class ProfileUpdater {
  /** @type {import('../storage/memory-store.js').MemoryStore | null} */
  #store

  /** @type {number} */
  #alpha

  /** @type {Map<string, number>} agentId:capability → 精确成功次数（避免浮点反推） */
  #successCounts = new Map()

  /**
   * @param {Object} deps
   * @param {Object} [deps.store] - 存储实例
   * @param {number} [deps.alpha=0.1] - EMA 学习率
   */
  constructor({ store = null, alpha = DEFAULT_ALPHA } = {}) {
    this.#store = store
    this.#alpha = alpha
  }

  /**
   * 任务完成后更新 Agent 能力画像
   *
   * 流程：
   * 1. 获取当前画像（不存在则创建默认）
   * 2. 用 EMA 更新 actualScore
   * 3. 更新 taskCount、successRate、avgDuration
   * 4. 计算趋势
   * 5. 持久化
   *
   * @param {Object} params
   * @param {string} params.agentId
   * @param {string} params.capability
   * @param {number} params.score - 本次任务评分 0.0-1.0
   * @param {boolean} params.success - 任务是否成功
   * @param {number} params.durationMs - 任务耗时 ms
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile>}
   */
  async updateOnTaskComplete({ agentId, capability, score, success, durationMs }) {
    // 获取现有画像
    let profile = await this.#getProfile(agentId, capability)

    if (!profile) {
      profile = createCapabilityProfile({ agentId, capability })
    }

    // EMA 更新 actualScore
    const newActualScore = emaUpdate(profile.actualScore, score, this.#alpha)

    // 更新 successRate
    const newTaskCount = profile.taskCount + 1
    let newSuccessRate
    if (this.#store) {
      // 有存储时，使用内部精确计数避免浮点反推误差
      const key = `${agentId}:${capability}`
      const prevSuccessCount = this.#successCounts.get(key) ?? Math.round(profile.successRate * profile.taskCount)
      const newSuccessCount = prevSuccessCount + (success ? 1 : 0)
      this.#successCounts.set(key, newSuccessCount)
      newSuccessRate = newSuccessCount / newTaskCount
    } else {
      // 无存储时直接增量计算
      const prevSuccesses = Math.round(profile.successRate * profile.taskCount)
      newSuccessRate = (prevSuccesses + (success ? 1 : 0)) / newTaskCount
    }

    // 更新 avgDuration（增量平均）
    const newAvgDuration = profile.taskCount === 0
      ? durationMs
      : (profile.avgDuration * profile.taskCount + durationMs) / newTaskCount

    // 计算趋势
    const recentScores = await this.#getRecentScores(agentId, capability, 50)
    recentScores.push(score)
    const newTrend = computeTrend(recentScores)

    // 构造更新后的画像
    const updated = createCapabilityProfile({
      agentId,
      capability,
      declaredConfidence: profile.declaredConfidence,
      actualScore: newActualScore,
      taskCount: newTaskCount,
      successRate: newSuccessRate,
      avgDuration: newAvgDuration,
      specializations: profile.specializations,
      recentTrend: newTrend
    })

    // 持久化
    if (this.#store) {
      await this.#store.upsertProfile(updated)
    }

    return updated
  }

  /**
   * 获取 Agent 在某能力下的画像
   *
   * @param {string} agentId
   * @param {string} capability
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile | null>}
   */
  async #getProfile(agentId, capability) {
    if (!this.#store) return null
    return this.#store.getProfile(agentId, capability)
  }

  /**
   * 获取最近的评分列表（用于趋势计算）
   *
   * @param {string} agentId
   * @param {string} capability
   * @param {number} limit
   * @returns {Promise<number[]>}
   */
  async #getRecentScores(agentId, capability, limit) {
    if (!this.#store) return []
    return this.#store.getRecentScores(agentId, capability, limit)
  }
}
