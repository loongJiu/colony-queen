/**
 * SQLiteStore — SQLite 存储实现
 *
 * 使用 better-sqlite3（同步 API）实现持久化存储，
 * 通过 async 包装保持与接口一致的 Promise 返回值。
 */

import { STORAGE_METHODS } from './interface.js'

export class SQLiteStore {
  /** @type {string} */
  #dbPath

  /** @type {import('better-sqlite3').Database | null} */
  #db = null

  /**
   * @param {Object} options
   * @param {string} options.path - SQLite 数据库文件路径
   */
  constructor({ path }) {
    this.#dbPath = path
  }

  async init() {
    // better-sqlite3 是同步加载的
    const Database = (await import('better-sqlite3')).default
    this.#db = new Database(this.#dbPath)

    // 启用 WAL 模式，提升并发读写性能
    this.#db.pragma('journal_mode = WAL')

    // 建表
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        feedbackId   TEXT PRIMARY KEY,
        taskId       TEXT NOT NULL,
        conversationId TEXT NOT NULL DEFAULT '',
        agentId      TEXT NOT NULL DEFAULT 'unknown',
        capability   TEXT NOT NULL DEFAULT '',
        source       TEXT NOT NULL CHECK(source IN ('auto', 'user')),
        userScore    INTEGER,
        autoScore    REAL,
        finalScore   REAL,
        userComment  TEXT,
        corrections  TEXT,
        taskContext  TEXT,
        createdAt    INTEGER NOT NULL
      )
    `)

    // 创建索引
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feedbacks_taskId ON feedbacks(taskId);
      CREATE INDEX IF NOT EXISTS idx_feedbacks_agentId ON feedbacks(agentId)
    `)

    // 建表：plan_cases
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS plan_cases (
        caseId      TEXT PRIMARY KEY,
        inputHash   TEXT NOT NULL,
        inputText   TEXT NOT NULL,
        plan        TEXT NOT NULL,
        score       REAL NOT NULL DEFAULT 0,
        usedCount   INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'discarded')),
        createdAt   INTEGER NOT NULL,
        updatedAt   INTEGER NOT NULL
      )
    `)

    // 创建索引：inputHash 去重 + status+score 搜索
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS idx_plan_cases_inputHash ON plan_cases(inputHash);
      CREATE INDEX IF NOT EXISTS idx_plan_cases_status_score ON plan_cases(status, score DESC)
    `)

    // 建表：capability_profiles
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS capability_profiles (
        agentId              TEXT NOT NULL,
        capability           TEXT NOT NULL,
        declaredConfidence   REAL NOT NULL DEFAULT 0.5,
        actualScore          REAL NOT NULL DEFAULT 0.5,
        taskCount            INTEGER NOT NULL DEFAULT 0,
        successRate          REAL NOT NULL DEFAULT 0.5,
        avgDuration          REAL NOT NULL DEFAULT 0,
        specializations      TEXT NOT NULL DEFAULT '{}',
        recentTrend          TEXT NOT NULL DEFAULT 'stable' CHECK(recentTrend IN ('improving', 'stable', 'declining')),
        updatedAt            INTEGER NOT NULL,
        PRIMARY KEY (agentId, capability)
      )
    `)

    // 建表：profile_score_history（用于趋势计算）
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS profile_score_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId     TEXT NOT NULL,
        capability  TEXT NOT NULL,
        score       REAL NOT NULL,
        createdAt   INTEGER NOT NULL
      )
    `)

    // 创建索引
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS idx_score_history_agent_cap ON profile_score_history(agentId, capability, createdAt DESC)
    `)

    // 建表：work_sessions
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS work_sessions (
        sessionId       TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        conversationIds TEXT NOT NULL DEFAULT '[]',
        keyOutputs      TEXT NOT NULL DEFAULT '{}',
        sharedContext   TEXT NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
        createdAt       INTEGER NOT NULL,
        updatedAt       INTEGER NOT NULL
      )
    `)

    // 创建索引
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_work_sessions_createdAt ON work_sessions(createdAt DESC)
    `)
  }

  async close() {
    if (this.#db) {
      this.#db.close()
      this.#db = null
    }
  }

  /**
   * 插入一条反馈记录
   *
   * @param {import('../models/feedback.js').FeedbackRecord} record
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord>}
   */
  async insertFeedback(record) {
    const stmt = this.#db.prepare(`
      INSERT INTO feedbacks (feedbackId, taskId, conversationId, agentId, capability,
        source, userScore, autoScore, finalScore, userComment, corrections, taskContext, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.feedbackId,
      record.taskId,
      record.conversationId,
      record.agentId,
      record.capability,
      record.source,
      record.userScore ?? null,
      record.autoScore ?? null,
      record.finalScore ?? null,
      record.userComment ?? null,
      record.corrections ? JSON.stringify(record.corrections) : null,
      record.taskContext ? JSON.stringify(record.taskContext) : null,
      record.createdAt
    )

    return record
  }

  /**
   * 按 feedbackId 查询
   *
   * @param {string} feedbackId
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord | null>}
   */
  async getFeedbackById(feedbackId) {
    const row = this.#db.prepare('SELECT * FROM feedbacks WHERE feedbackId = ?').get(feedbackId)
    return row ? this.#rowToRecord(row) : null
  }

  /**
   * 按 taskId 查询所有反馈
   *
   * @param {string} taskId
   * @returns {Promise<import('../models/feedback.js').FeedbackRecord[]>}
   */
  async getFeedbacksByTaskId(taskId) {
    const rows = this.#db.prepare('SELECT * FROM feedbacks WHERE taskId = ? ORDER BY createdAt ASC').all(taskId)
    return rows.map(row => this.#rowToRecord(row))
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
    const rows = this.#db.prepare(
      'SELECT * FROM feedbacks WHERE agentId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?'
    ).all(agentId, limit, offset)
    return rows.map(row => this.#rowToRecord(row))
  }

  /**
   * 将数据库行转换为 FeedbackRecord 格式
   *
   * @param {Object} row
   * @returns {import('../models/feedback.js').FeedbackRecord}
   */
  #rowToRecord(row) {
    const record = {
      feedbackId: row.feedbackId,
      taskId: row.taskId,
      conversationId: row.conversationId,
      agentId: row.agentId,
      capability: row.capability,
      source: row.source,
      ...(row.userScore != null && { userScore: row.userScore }),
      ...(row.autoScore != null && { autoScore: row.autoScore }),
      ...(row.finalScore != null && { finalScore: row.finalScore }),
      ...(row.userComment != null && { userComment: row.userComment }),
      ...(row.corrections != null && { corrections: JSON.parse(row.corrections) }),
      ...(row.taskContext != null && { taskContext: JSON.parse(row.taskContext) }),
      createdAt: row.createdAt
    }
    return Object.freeze(record)
  }

  // ─── PlanCase 操作 ───────────────────────────────────────

  /**
   * 插入一条规划案例
   *
   * @param {import('../models/plan-case.js').PlanCaseRecord} record
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord>}
   */
  async insertPlanCase(record) {
    const stmt = this.#db.prepare(`
      INSERT INTO plan_cases (caseId, inputHash, inputText, plan, score, usedCount, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.caseId,
      record.inputHash,
      record.inputText,
      record.plan,
      record.score,
      record.usedCount,
      record.status,
      record.createdAt,
      record.updatedAt
    )

    return record
  }

  /**
   * 按 caseId 查询
   *
   * @param {string} caseId
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord | null>}
   */
  async getPlanCaseById(caseId) {
    const row = this.#db.prepare('SELECT * FROM plan_cases WHERE caseId = ?').get(caseId)
    return row ? this.#planCaseRowToRecord(row) : null
  }

  /**
   * 按关键词搜索相似规划案例
   *
   * MVP 实现：使用 LIKE 匹配关键词。
   * 只返回 status='confirmed' 且 score >= minScore 的案例。
   *
   * @param {string} inputText
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {number} [options.minScore=0.7]
   * @returns {Promise<import('../models/plan-case.js').PlanCaseRecord[]>}
   */
  async searchSimilarCases(inputText, options = {}) {
    const { limit = 5, minScore = 0.7 } = options
    const keywords = this.#extractKeywords(inputText)
    if (keywords.length === 0) return []

    // 构建 WHERE 子句：每个关键词 OR 一个 LIKE 条件
    const conditions = keywords.map(() => 'inputText LIKE ?').join(' OR ')
    const params = keywords.map(kw => `%${kw}%`)

    const sql = `
      SELECT * FROM plan_cases
      WHERE status = 'confirmed' AND score >= ? AND (${conditions})
      ORDER BY score DESC
      LIMIT ?
    `

    const rows = this.#db.prepare(sql).all(minScore, ...params, limit)
    return rows.map(row => this.#planCaseRowToRecord(row))
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
    const setClauses = []
    const values = []

    if (updates.score !== undefined) {
      setClauses.push('score = ?')
      values.push(updates.score)
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      values.push(updates.status)
    }
    if (updates.usedCount !== undefined) {
      setClauses.push('usedCount = ?')
      values.push(updates.usedCount)
    }

    if (setClauses.length === 0) return this.getPlanCaseById(caseId)

    setClauses.push('updatedAt = ?')
    values.push(Date.now())
    values.push(caseId)

    const sql = `UPDATE plan_cases SET ${setClauses.join(', ')} WHERE caseId = ?`
    const result = this.#db.prepare(sql).run(...values)

    if (result.changes === 0) return null
    return this.getPlanCaseById(caseId)
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
    const rows = this.#db.prepare(
      'SELECT * FROM plan_cases ORDER BY createdAt DESC LIMIT ?'
    ).all(limit)
    return rows.map(row => this.#planCaseRowToRecord(row))
  }

  /**
   * 从文本中提取关键词
   *
   * @param {string} text
   * @returns {string[]}
   */
  #extractKeywords(text) {
    if (!text) return []
    const lower = text.toLowerCase()
    const englishWords = (lower.match(/[a-z]{2,}/g) ?? [])
    const chineseChars = (lower.match(/[\u4e00-\u9fff]/g) ?? [])
    return [...new Set([...englishWords, ...chineseChars])]
  }

  /**
   * 将数据库行转换为 PlanCaseRecord 格式
   *
   * @param {Object} row
   * @returns {import('../models/plan-case.js').PlanCaseRecord}
   */
  #planCaseRowToRecord(row) {
    return Object.freeze({
      caseId: row.caseId,
      inputHash: row.inputHash,
      inputText: row.inputText,
      plan: row.plan,
      score: row.score,
      usedCount: row.usedCount,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  }

  // ─── CapabilityProfile 操作 ──────────────────────────────

  /**
   * 插入或更新 Agent 能力画像
   *
   * @param {import('../models/capability-profile.js').CapabilityProfile} profile
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile>}
   */
  async upsertProfile(profile) {
    const stmt = this.#db.prepare(`
      INSERT INTO capability_profiles (agentId, capability, declaredConfidence, actualScore,
        taskCount, successRate, avgDuration, specializations, recentTrend, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agentId, capability) DO UPDATE SET
        declaredConfidence = excluded.declaredConfidence,
        actualScore = excluded.actualScore,
        taskCount = excluded.taskCount,
        successRate = excluded.successRate,
        avgDuration = excluded.avgDuration,
        specializations = excluded.specializations,
        recentTrend = excluded.recentTrend,
        updatedAt = excluded.updatedAt
    `)

    stmt.run(
      profile.agentId,
      profile.capability,
      profile.declaredConfidence,
      profile.actualScore,
      profile.taskCount,
      profile.successRate,
      profile.avgDuration,
      JSON.stringify(profile.specializations),
      profile.recentTrend,
      profile.updatedAt
    )

    // 追加 score 到历史
    const historyStmt = this.#db.prepare(
      'INSERT INTO profile_score_history (agentId, capability, score, createdAt) VALUES (?, ?, ?, ?)'
    )
    historyStmt.run(profile.agentId, profile.capability, profile.actualScore, Date.now())

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
    const row = this.#db.prepare(
      'SELECT * FROM capability_profiles WHERE agentId = ? AND capability = ?'
    ).get(agentId, capability)
    return row ? this.#profileRowToRecord(row) : null
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
    const rows = this.#db.prepare(
      'SELECT score FROM profile_score_history WHERE agentId = ? AND capability = ? ORDER BY createdAt ASC LIMIT ?'
    ).all(agentId, capability, limit)
    return rows.map(r => r.score)
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

    let sql = 'SELECT * FROM capability_profiles'
    const params = []

    if (agentId) {
      sql += ' WHERE agentId = ?'
      params.push(agentId)
    }

    sql += ' ORDER BY actualScore DESC'

    const rows = this.#db.prepare(sql).all(...params)
    return rows.map(row => this.#profileRowToRecord(row))
  }

  /**
   * 按 agentId 获取所有能力画像
   *
   * @param {string} agentId
   * @returns {Promise<import('../models/capability-profile.js').CapabilityProfile[]>}
   */
  async getProfilesByAgentId(agentId) {
    const rows = this.#db.prepare(
      'SELECT * FROM capability_profiles WHERE agentId = ? ORDER BY actualScore DESC'
    ).all(agentId)
    return rows.map(row => this.#profileRowToRecord(row))
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
    const rows = this.#db.prepare(
      'SELECT * FROM feedbacks ORDER BY createdAt DESC LIMIT ? OFFSET ?'
    ).all(limit, offset)
    return rows.map(row => this.#rowToRecord(row))
  }

  /**
   * 获取反馈记录总数
   *
   * @returns {Promise<number>}
   */
  async getFeedbackCount() {
    const row = this.#db.prepare('SELECT COUNT(*) as count FROM feedbacks').get()
    return row.count
  }

  /**
   * 将数据库行转换为 CapabilityProfile 格式
   *
   * @param {Object} row
   * @returns {import('../models/capability-profile.js').CapabilityProfile}
   */
  #profileRowToRecord(row) {
    return Object.freeze({
      agentId: row.agentId,
      capability: row.capability,
      declaredConfidence: row.declaredConfidence,
      actualScore: row.actualScore,
      taskCount: row.taskCount,
      successRate: row.successRate,
      avgDuration: row.avgDuration,
      specializations: JSON.parse(row.specializations),
      recentTrend: row.recentTrend,
      updatedAt: row.updatedAt
    })
  }

  // ─── WorkSession 操作 ────────────────────────────────────

  /**
   * 插入一条工作会话记录
   *
   * @param {import('../models/work-session.js').WorkSessionRecord} record
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord>}
   */
  async insertSession(record) {
    const stmt = this.#db.prepare(`
      INSERT INTO work_sessions (sessionId, title, conversationIds, keyOutputs, sharedContext, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.sessionId,
      record.title,
      JSON.stringify(record.conversationIds),
      JSON.stringify(record.keyOutputs),
      JSON.stringify(record.sharedContext),
      record.status,
      record.createdAt,
      record.updatedAt
    )

    return record
  }

  /**
   * 按 sessionId 查询工作会话
   *
   * @param {string} sessionId
   * @returns {Promise<import('../models/work-session.js').WorkSessionRecord | null>}
   */
  async getSession(sessionId) {
    const row = this.#db.prepare('SELECT * FROM work_sessions WHERE sessionId = ?').get(sessionId)
    return row ? this.#sessionRowToRecord(row) : null
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
    const setClauses = []
    const values = []

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.conversationIds !== undefined) {
      setClauses.push('conversationIds = ?')
      values.push(JSON.stringify(updates.conversationIds))
    }
    if (updates.keyOutputs !== undefined) {
      setClauses.push('keyOutputs = ?')
      values.push(JSON.stringify(updates.keyOutputs))
    }
    if (updates.sharedContext !== undefined) {
      setClauses.push('sharedContext = ?')
      values.push(JSON.stringify(updates.sharedContext))
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      values.push(updates.status)
    }

    if (setClauses.length === 0) return this.getSession(sessionId)

    setClauses.push('updatedAt = ?')
    values.push(Date.now())
    values.push(sessionId)

    const sql = `UPDATE work_sessions SET ${setClauses.join(', ')} WHERE sessionId = ?`
    const result = this.#db.prepare(sql).run(...values)

    if (result.changes === 0) return null
    return this.getSession(sessionId)
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

    let sql = 'SELECT * FROM work_sessions'
    const params = []

    if (status) {
      sql += ' WHERE status = ?'
      params.push(status)
    }

    sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const rows = this.#db.prepare(sql).all(...params)
    return rows.map(row => this.#sessionRowToRecord(row))
  }

  /**
   * 获取会话数量
   *
   * @param {string} [status] - 按状态过滤
   * @returns {Promise<number>}
   */
  async getSessionCount(status) {
    if (status) {
      const row = this.#db.prepare('SELECT COUNT(*) as count FROM work_sessions WHERE status = ?').get(status)
      return row.count
    }
    const row = this.#db.prepare('SELECT COUNT(*) as count FROM work_sessions').get()
    return row.count
  }

  /**
   * 将数据库行转换为 WorkSessionRecord 格式
   *
   * @param {Object} row
   * @returns {import('../models/work-session.js').WorkSessionRecord}
   */
  #sessionRowToRecord(row) {
    return Object.freeze({
      sessionId: row.sessionId,
      title: row.title,
      conversationIds: JSON.parse(row.conversationIds),
      keyOutputs: JSON.parse(row.keyOutputs),
      sharedContext: JSON.parse(row.sharedContext),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  }
}
