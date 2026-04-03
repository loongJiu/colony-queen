/**
 * Hive — Agent 注册表
 *
 * 内存中的多维度索引注册表，支持按 ID、能力、状态进行 O(1) 查询。
 * 纯数据结构，不依赖 Fastify 或任何 I/O。
 */

import { createAgentRecord, VALID_STATUSES } from '../models/agent.js'
import { NotFoundError, ValidationError } from '../utils/errors.js'

export class Hive {
  /** @type {Map<string, import('../models/agent.js').AgentRecord>} */
  #agents = new Map()

  /** @type {Map<string, Set<string>>} */
  #byCapability = new Map()

  /** @type {Map<string, Set<string>>} */
  #byStatus = new Map()

  // ── 注册 ──────────────────────────────────────

  /**
   * 注册新 Agent
   *
   * @param {Object} spec - 解析后的 bee.yaml 内容
   * @param {string} sessionToken - 会话令牌
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {ValidationError} sessionToken 已被使用
   */
  register(spec, sessionToken) {
    for (const agent of this.#agents.values()) {
      if (agent.sessionToken === sessionToken) {
        throw new ValidationError(`Agent already registered with session token "${sessionToken}"`)
      }
    }

    const record = createAgentRecord(spec, sessionToken)

    this.#agents.set(record.agentId, record)

    for (const cap of record.capabilities) {
      this.#getOrCreateSet(this.#byCapability, cap).add(record.agentId)
    }

    this.#getOrCreateSet(this.#byStatus, record.status).add(record.agentId)

    return record
  }

  // ── 注销 ──────────────────────────────────────

  /**
   * 注销 Agent，清理所有索引
   *
   * @param {string} agentId
   * @returns {import('../models/agent.js').AgentRecord} 被移除的记录
   * @throws {NotFoundError} agentId 不存在
   */
  unregister(agentId) {
    const record = this.#agents.get(agentId)
    if (!record) {
      throw new NotFoundError(`Agent "${agentId}" not found`)
    }

    this.#agents.delete(agentId)

    for (const cap of record.capabilities) {
      this.#removeFromSet(this.#byCapability, cap, agentId)
    }

    this.#removeFromSet(this.#byStatus, record.status, agentId)

    return record
  }

  // ── 查询 ──────────────────────────────────────

  /**
   * 按 ID 获取 Agent
   *
   * @param {string} agentId
   * @returns {import('../models/agent.js').AgentRecord | undefined}
   */
  get(agentId) {
    return this.#agents.get(agentId)
  }

  /**
   * 按能力查询 Agent
   *
   * @param {string} capability
   * @param {{ activeOnly?: boolean }} [options] - activeOnly 排除 offline
   * @returns {import('../models/agent.js').AgentRecord[]}
   */
  findByCapability(capability, options = {}) {
    const ids = this.#byCapability.get(capability)
    if (!ids) return []

    const results = []
    for (const id of ids) {
      const agent = this.#agents.get(id)
      if (agent) {
        if (options.activeOnly && agent.status === 'offline') continue
        results.push(agent)
      }
    }
    return results
  }

  /**
   * 按状态查询 Agent
   *
   * @param {string} status - idle | busy | error | offline
   * @returns {import('../models/agent.js').AgentRecord[]}
   */
  findByStatus(status) {
    const ids = this.#byStatus.get(status)
    if (!ids) return []

    const results = []
    for (const id of ids) {
      const agent = this.#agents.get(id)
      if (agent) results.push(agent)
    }
    return results
  }

  // ── 更新 ──────────────────────────────────────

  /**
   * 更新 Agent 心跳及健康数据
   *
   * @param {string} agentId
   * @param {{ load?: number, activeTasks?: number, queueDepth?: number, status?: string }} [healthData]
   * @returns {import('../models/agent.js').AgentRecord} 更新后的记录
   * @throws {NotFoundError} agentId 不存在
   * @throws {ValidationError} status 值非法
   */
  updateHeartbeat(agentId, healthData = {}) {
    const record = this.#agents.get(agentId)
    if (!record) {
      throw new NotFoundError(`Agent "${agentId}" not found`)
    }

    const newStatus = healthData.status ?? record.status
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status "${newStatus}", must be one of: ${VALID_STATUSES.join(', ')}`
      )
    }

    const statusChanged = record.status !== newStatus

    const updated = Object.freeze({
      ...record,
      ...healthData,
      status: newStatus,
      lastHeartbeat: Date.now()
    })

    this.#agents.set(agentId, updated)

    if (statusChanged) {
      this.#removeFromSet(this.#byStatus, record.status, agentId)
      this.#getOrCreateSet(this.#byStatus, newStatus).add(agentId)
    }

    return updated
  }

  /**
   * 标记 Agent 为 offline
   *
   * @param {string} agentId
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {NotFoundError} agentId 不存在
   */
  markOffline(agentId) {
    return this.updateHeartbeat(agentId, { status: 'offline' })
  }

  // ── 辅助 ──────────────────────────────────────

  /** 注册总数 */
  get size() {
    return this.#agents.size
  }

  /**
   * 检查 Agent 是否已注册
   *
   * @param {string} agentId
   * @returns {boolean}
   */
  has(agentId) {
    return this.#agents.has(agentId)
  }

  // ── 内部工具 ──────────────────────────────────

  /**
   * 获取或创建 Map 中的 Set
   * @param {Map<string, Set<string>>} map
   * @param {string} key
   * @returns {Set<string>}
   */
  #getOrCreateSet(map, key) {
    let set = map.get(key)
    if (!set) {
      set = new Set()
      map.set(key, set)
    }
    return set
  }

  /**
   * 从 Set 中移除元素，空 Set 时清理 key
   * @param {Map<string, Set<string>>} map
   * @param {string} key
   * @param {string} value
   */
  #removeFromSet(map, key, value) {
    const set = map.get(key)
    if (!set) return
    set.delete(value)
    if (set.size === 0) {
      map.delete(key)
    }
  }
}
