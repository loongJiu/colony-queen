/**
 * PlanMemory 服务 — 规划案例记忆
 *
 * 记录成功的规划案例，在相似任务时作为 few-shot 注入 LLM prompt。
 * 与存储层交互，提供业务层面的 case 生命周期管理。
 */

import { createPlanCaseRecord, computeInputHash } from '../models/plan-case.js'

export class PlanMemory {
  /** @type {import('../storage/memory-store.js').MemoryStore | import('../storage/sqlite-store.js').SQLiteStore | null} */
  #store

  /** @type {Object} */
  #logger

  /** @type {Map<string, string>} taskId → caseId 映射 */
  #taskCaseMap = new Map()

  /**
   * @param {{
   *   store?: Object,
   *   logger?: Object
   * }} deps
   */
  constructor({ store = null, logger = console } = {}) {
    this.#store = store
    this.#logger = logger
  }

  /**
   * 记录待确认的规划案例
   *
   * 任务规划完成后立即调用，status='pending' 等待评分确认。
   *
   * @param {string} inputText - 任务描述
   * @param {Object} plan - 规划方案（strategy, steps 等结构）
   * @param {string} [taskId] - 关联的任务 ID，用于后续评分更新
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord | null>}
   */
  async recordPending(inputText, plan, taskId) {
    if (!this.#store) return null

    try {
      const record = createPlanCaseRecord({ inputText, plan, score: 0, status: 'pending' })
      const saved = await this.#store.insertPlanCase(record)

      // 维护 taskId → caseId 映射，用于 feedback 评分时关联更新
      if (taskId) {
        this.#taskCaseMap.set(taskId, record.caseId)
      }

      this.#logger.info?.({ caseId: record.caseId, taskId }, 'plan case recorded as pending')
      return saved
    } catch (err) {
      this.#logger.warn?.({ err: err.message }, 'failed to record pending plan case')
      return null
    }
  }

  /**
   * 确认规划案例为成功
   *
   * 评分完成后调用，将 status 更新为 'confirmed' 并设置评分。
   *
   * @param {string} caseId
   * @param {number} score - 综合评分 0.0-1.0
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord | null>}
   */
  async recordSuccess(caseId, score) {
    if (!this.#store) return null

    try {
      const updated = await this.#store.updatePlanCase(caseId, {
        score,
        status: 'confirmed'
      })

      if (updated) {
        this.#logger.info?.({ caseId, score }, 'plan case confirmed')
      }
      return updated
    } catch (err) {
      this.#logger.warn?.({ err: err.message, caseId }, 'failed to confirm plan case')
      return null
    }
  }

  /**
   * 标记规划案例为废弃
   *
   * @param {string} caseId
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord | null>}
   */
  async recordFailure(caseId) {
    if (!this.#store) return null

    try {
      const updated = await this.#store.updatePlanCase(caseId, {
        status: 'discarded'
      })

      if (updated) {
        this.#logger.info?.({ caseId }, 'plan case discarded')
      }
      return updated
    } catch (err) {
      this.#logger.warn?.({ err: err.message, caseId }, 'failed to discard plan case')
      return null
    }
  }

  /**
   * 根据任务评分更新关联的 planCase
   *
   * 通过 taskId → caseId 映射找到案例，根据分数阈值确认或废弃。
   *
   * @param {string} taskId - 任务 ID
   * @param {number} score - 综合评分 0.0-1.0
   * @returns {Promise<boolean>} 是否成功更新
   */
  async updateScoreByTaskId(taskId, score) {
    try {
      if (!this.#store) return false

      const caseId = this.#taskCaseMap.get(taskId)
      if (!caseId) return false

      const status = score >= 0.6 ? 'confirmed' : 'discarded'

      const updated = await this.#store.updatePlanCase(caseId, { score, status })

      // 映射清理，避免内存泄漏
      this.#taskCaseMap.delete(taskId)

      if (updated) {
        this.#logger.info?.({ caseId, taskId, score, status }, 'plan case score updated')
      }
      return !!updated
    } catch (err) {
      this.#logger.warn?.({ err: err.message, taskId }, 'PlanMemory.updateScoreByTaskId failed')
      return false
    }
  }

  /**
   * 获取 taskId 关联的 caseId
   *
   * @param {string} taskId
   * @returns {string|undefined}
   */
  getCaseIdByTaskId(taskId) {
    return this.#taskCaseMap.get(taskId)
  }

  /**
   * 检索相似的历史成功案例
   *
   * @param {string} inputText - 当前任务描述
   * @param {number} [limit=3] - 返回数量上限
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord[]>}
   */
  async searchSimilar(inputText, limit = 3) {
    if (!this.#store) return []

    try {
      const cases = await this.#store.searchSimilarCases(inputText, {
        limit,
        minScore: 0.7
      })

      // 递增 usedCount（异步，不阻塞）
      for (const c of cases) {
        this.#store.updatePlanCase(c.caseId, { usedCount: c.usedCount + 1 }).catch(() => {})
      }

      return cases
    } catch (err) {
      this.#logger.warn?.({ err: err.message }, 'failed to search similar cases')
      return []
    }
  }

  /**
   * 构造 few-shot 文本注入 Planner prompt
   *
   * 将相似案例的输入输出格式化为可注入 LLM system prompt 的参考文本。
   *
   * @param {string} inputText - 当前任务描述
   * @param {number} [limit=3] - 参考案例数量
   * @returns {Promise<string>} few-shot 文本，无匹配时返回空字符串
   */
  async buildFewShotContext(inputText, limit = 3) {
    const cases = await this.searchSimilar(inputText, limit)
    if (cases.length === 0) return ''

    const examples = cases.map((c, i) => {
      let planStr
      try {
        planStr = JSON.stringify(JSON.parse(c.plan), null, 2)
      } catch {
        planStr = c.plan
      }
      return `### 参考案例 ${i + 1}（评分: ${c.score.toFixed(2)}，复用 ${c.usedCount} 次）
任务: ${c.inputText}
规划:
${planStr}`
    }).join('\n\n')

    return `## 历史成功案例参考（请参考但不必照搬）

${examples}`
  }

  /**
   * 从文本中提取关键词（MVP 简单分词）
   *
   * 规则：
   * - 英文按空格分割，忽略短于 2 字符的词
   * - 中文按单字分割
   * - 去重
   *
   * @param {string} text
   * @returns {string[]}
   */
  extractKeywords(text) {
    if (!text) return []
    const lower = text.toLowerCase()
    const englishWords = (lower.match(/[a-z]{2,}/g) ?? [])
    const chineseChars = (lower.match(/[\u4e00-\u9fff]/g) ?? [])
    return [...new Set([...englishWords, ...chineseChars])]
  }
}
