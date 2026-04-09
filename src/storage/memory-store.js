/**
 * MemoryStore — 内存存储实现
 *
 * 用于开发和测试环境，数据存储在内存中，进程退出即丢失。
 * 实现了 interface.js 中定义的所有方法。
 */

import { STORAGE_METHODS } from './interface.js'

export class MemoryStore {
  /** @type {Map<string, import('../models/feedback.js').FeedbackRecord>} feedbackId → FeedbackRecord */
  #feedbacks = new Map()

  /** @type {Map<string, string[]>} taskId → feedbackId[] */
  #taskIndex = new Map()

  /** @type {Map<string, string[]>} agentId → feedbackId[] */
  #agentIndex = new Map()

  async init() {
    // 内存存储无需初始化
  }

  async close() {
    this.#feedbacks.clear()
    this.#taskIndex.clear()
    this.#agentIndex.clear()
  }

  /**
   * 插入一条反馈记录
   *
   * @param {import('../models/feedback.js').FeedbackRecord} record
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord>}
   */
  async insertFeedback(record) {
    if (this.#feedbacks.has(record.feedbackId)) {
      throw new Error(`Duplicate feedbackId: ${record.feedbackId}`)
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
}
