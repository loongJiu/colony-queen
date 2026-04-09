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
}
