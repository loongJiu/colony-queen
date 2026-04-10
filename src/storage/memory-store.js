/**
 * MemoryStore — 内存存储实现
 *
 * 用于开发和测试环境，数据存储在内存中，进程退出即丢失。
 * 实现了 interface.js 中定义的所有方法。
 */

import { STORAGE_METHODS } from './interface.js'
import { DuplicateIdError } from '../utils/errors.js'

export class MemoryStore {
  /** @type {Map<string, import('../models/feedback.js').FeedbackRecord>} feedbackId → FeedbackRecord */
  #feedbacks = new Map()

  /** @type {Map<string, string[]>} taskId → feedbackId[] */
  #taskIndex = new Map()

  /** @type {Map<string, string[]>} agentId → feedbackId[] */
  #agentIndex = new Map()

  /** @type {Map<string, import('../models/plan-case.js').PlanCaseRecord>} caseId → PlanCaseRecord */
  #planCases = new Map()

  /** @type {Map<string, import('../models/capability-profile.js').CapabilityProfile>} agentId:capability → Profile */
  #profiles = new Map()

  /** @type {Map<string, number[]>} agentId:capability → recent scores */
  #scoreHistory = new Map()

  /** @type {Map<string, import('../models/work-session.js').WorkSessionRecord>} sessionId → WorkSessionRecord */
  #sessions = new Map()

  async init() {
    // 内存存储无需初始化
  }

  async close() {
    this.#feedbacks.clear()
    this.#taskIndex.clear()
    this.#agentIndex.clear()
    this.#planCases.clear()
    this.#profiles.clear()
    this.#scoreHistory.clear()
    this.#sessions.clear()
  }

  /**
   * 插入一条反馈记录
   *
   * @param {import('../models/feedback.js').FeedbackRecord} record
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord>}
   */
  async insertFeedback(record) {
    if (this.#feedbacks.has(record.feedbackId)) {
      throw new DuplicateIdError(`Duplicate feedbackId: ${record.feedbackId}`)
    }

    this.#feedbacks.set(record.feedbackId, record)

    // 更新 taskId 索引
    const taskFeedbacks = this.#taskIndex.get(record.taskId) ?? []
    taskFeedbacks.push(record.feedbackId)
    this.#taskIndex.set(record.taskId, taskFeedbacks)

    // 更新 agentId 索引
    const agentFeedbacks = this.#agentIndex.get(record.agentId) ?? []
    agentFeedbacks.push(record.feedbackId)
    this.#agentIndex.set(record.agentId, agentFeedbacks)

    return record
  }

  /**
   * 按 feedbackId 查询
   *
   * @param {string} feedbackId
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord | null>}
   */
  async getFeedbackById(feedbackId) {
    return this.#feedbacks.get(feedbackId) ?? null
  }

  /**
   * 按 taskId 查询所有反馈
   *
   * @param {string} taskId
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord[]>}
   */
  async getFeedbacksByTaskId(taskId) {
    const ids = this.#taskIndex.get(taskId) ?? []
    return ids.map(id => this.#feedbacks.get(id)).filter(Boolean)
  }

  /**
   * 按 agentId 查询反馈历史
   *
   * @param {string} agentId
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord[]>}
   */
  async getFeedbacksByAgentId(agentId, options = {}) {
    const { limit = 50, offset = 0 } = options
    const ids = this.#agentIndex.get(agentId) ?? []
    return ids
      .map(id => this.#feedbacks.get(id))
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit)
  }

  // ─── PlanCase 操作 ───────────────────────────────────────

  /**
   * 插入一条规划案例
   *
   * @param {import('../models/plan-case.js').PlanCaseRecord} record
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord>}
   */
  async insertPlanCase(record) {
    if (this.#planCases.has(record.caseId)) {
      throw new DuplicateIdError(`Duplicate caseId: ${record.caseId}`)
    }
    this.#planCases.set(record.caseId, record)
    return record
  }

  /**
   * 按 caseId 查询
   *
   * @param {string} caseId
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord | null>}
   */
  async getPlanCaseById(caseId) {
    return this.#planCases.get(caseId) ?? null
  }

  /**
   * 按关键词搜索相似规划案例
   *
   * MVP 实现：将 inputText 分词后在已有案例的 inputText 中做子串匹配。
   * 只返回 status=confirmed 且 score >= minScore 的案例。
   *
   * @param {string} inputText
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {number} [options.minScore=0.7]
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord[]>}
   */
  async searchSimilarCases(inputText, options = {}) {
    const { limit = 5, minScore = 0.7 } = options
    const keywords = extractKeywords(inputText)
    if (keywords.length === 0) return []

    const results = []
    for (const record of this.#planCases.values()) {
      if (record.status !== 'confirmed') continue
      if (record.score < minScore) continue

      const lower = record.inputText.toLowerCase()
      let matchCount = 0
      for (const kw of keywords) {
        if (lower.includes(kw)) matchCount++
      }
      if (matchCount > 0) {
        results.push({ record, matchCount })
      }
    }

    return results
      .sort((a, b) => b.matchCount - a.matchCount || b.score - a.score)
      .slice(0, limit)
      .map(r => r.record)
  }

  /**
   * 更新规划案例
   *
   * @param {string} caseId
   * @param {Object} updates
   * @param {number} [updates.score]
   * @param {string} [updates.status]
   * @param {number} [updates.usedCount]
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord | null>}
   */
  async updatePlanCase(caseId, updates) {
    const existing = this.#planCases.get(caseId)
    if (!existing) return null

    const updated = Object.freeze({
      ...existing,
      ...updates,
      caseId: existing.caseId,
      inputHash: existing.inputHash,
      inputText: existing.inputText,
      plan: existing.plan,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    })

    this.#planCases.set(caseId, updated)
    return updated
  }

  /**
   * 获取最近的规划案例
   *
   * @param {Object} [options]
   * @param {number} [options.limit=10]
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord[]>}
   */
  async getRecentCases(options = {}) {
    const { limit = 10 } = options
    return [...this.#planCases.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }

  // ─── CapabilityProfile 操作 ──────────────────────────────

  /**
   * 插入或更新 Agent 能力画像
   *
   * @param {import('../models/capability-profile.js').CapabilityProfile} profile
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile>}
   */
  async upsertProfile(profile) {
    const key = `${profile.agentId}:${profile.capability}`
    this.#profiles.set(key, profile)

    // 追加 score 到历史记录
    const scores = this.#scoreHistory.get(key) ?? []
    scores.push(profile.actualScore)
    this.#scoreHistory.set(key, scores)

    return profile
  }

  /**
   * 按 agentId + capability 查询画像
   *
   * @param {string} agentId
   * @param {string} capability
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile | null>}
   */
  async getProfile(agentId, capability) {
    const key = `${agentId}:${capability}`
    return this.#profiles.get(key) ?? null
  }

  /**
   * 获取 Agent 在某能力下最近的评分列表
   *
   * @param {string} agentId
   * @param {string} capability
   * @param {number} [limit=50]
   * @returns {Promise<number[]>}
   */
  async getRecentScores(agentId, capability, limit = 50) {
    const key = `${agentId}:${capability}`
    const scores = this.#scoreHistory.get(key) ?? []
    return scores.slice(-limit)
  }

  /**
   * 获取所有能力画像
   *
   * @param {Object} [options]
   * @param {string} [options.agentId] - 按 agentId 过滤
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile[]>}
   */
  async getAllProfiles(options = {}) {
    const { agentId } = options
    let results = [...this.#profiles.values()]

    if (agentId) {
      results = results.filter(p => p.agentId === agentId)
    }

    return results.sort((a, b) => b.actualScore - a.actualScore)
  }

  /**
   * 按 agentId 获取所有能力画像
   *
   * @param {string} agentId
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile[]>}
   */
  async getProfilesByAgentId(agentId) {
    return [...this.#profiles.values()]
      .filter(p => p.agentId === agentId)
      .sort((a, b) => b.actualScore - a.actualScore)
  }

  /**
   * 获取所有反馈记录
   *
   * @param {Object} [options]
   * @param {number} [options.limit=100]
   * @param {number} [options.offset=0]
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord[]>}
   */
  async getAllFeedbacks(options = {}) {
    const { limit = 100, offset = 0 } = options
    return [...this.#feedbacks.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit)
  }

  /**
   * 获取反馈记录总数
   *
   * @returns {Promise<number>}
   */
  async getFeedbackCount() {
    return this.#feedbacks.size
  }

  // ─── WorkSession 操作 ────────────────────────────────────

  /**
   * 插入一条工作会话记录
   *
   * @param {import('../models/work-session.js').WorkSessionRecord} record
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord>}
   */
  async insertSession(record) {
    if (this.#sessions.has(record.sessionId)) {
      throw new DuplicateIdError(`Duplicate sessionId: ${record.sessionId}`)
    }
    this.#sessions.set(record.sessionId, record)
    return record
  }

  /**
   * 按 sessionId 查询工作会话
   *
   * @param {string} sessionId
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async getSession(sessionId) {
    return this.#sessions.get(sessionId) ?? null
  }

  /**
   * 更新工作会话
   *
   * @param {string} sessionId
   * @param {Object} updates
   * @param {string} [updates.title]
   * @param {string[]} [updates.conversationIds]
   * @param {Object} [updates.keyOutputs]
   * @param {Object} [updates.sharedContext]
   * @param {string} [updates.status]
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async updateSession(sessionId, updates) {
    const existing = this.#sessions.get(sessionId)
    if (!existing) return null

    const updated = Object.freeze({
      ...existing,
      ...updates,
      sessionId: existing.sessionId,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    })

    this.#sessions.set(sessionId, updated)
    return updated
  }

  /**
   * 列出工作会话
   *
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {string} [options.status] - 按状态过滤
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord[]>}
   */
  async listSessions(options = {}) {
    const { limit = 50, offset = 0, status } = options
    let results = [...this.#sessions.values()]

    if (status) {
      results = results.filter(s => s.status === status)
    }

    return results
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit)
  }

  /**
   * 获取会话数量
   *
   * @param {string} [status] - 按状态过滤
   * @returns {Promise<number>}
   */
  async getSessionCount(status) {
    if (!status) return this.#sessions.size
    let count = 0
    for (const session of this.#sessions.values()) {
      if (session.status === status) count++
    }
    return count
  }
}

/**
 * 从文本中提取关键词（MVP 简单分词）
 *
 * 规则：
 * - 中文按单字分割（忽略标点）
 * - 英文按空格分割（忽略短于 2 字符的词）
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (!text) return []
  const lower = text.toLowerCase()

  // 提取英文词（>= 2 字符）
  const englishWords = (lower.match(/[a-z]{2,}/g) ?? [])

  // 提取中文字符
  const chineseChars = (lower.match(/[\u4e00-\u9fff]/g) ?? [])

  return [...new Set([...englishWords, ...chineseChars])]
}
