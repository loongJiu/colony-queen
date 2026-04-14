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

  /** @type {Map<string, string>} sessionToken → agentId */
  #bySessionToken = new Map()

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
    if (this.#bySessionToken.has(sessionToken)) {
      throw new ValidationError(`Agent already registered with session token "${sessionToken}"`)
    }

    const record = createAgentRecord(spec, sessionToken)

    this.#agents.set(record.agentId, record)
    this.#bySessionToken.set(sessionToken, record.agentId)

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
    this.#bySessionToken.delete(record.sessionToken)

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
   * 通过 session token 获取 Agent
   *
   * @param {string} sessionToken
   * @returns {import('../models/agent.js').AgentRecord | undefined}
   */
  getBySessionToken(sessionToken) {
    const agentId = this.#bySessionToken.get(sessionToken)
    if (!agentId) return undefined
    return this.#agents.get(agentId)
  }

  /**
   * 更新 Agent 的 spec 字段（capabilities, constraints 等）
   *
   * @param {string} agentId
   * @param {{ capabilities?: string[], constraints?: Object, [key: string]: any }} patch
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {NotFoundError} agentId 不存在
   */
  updateSpec(agentId, patch) {
    const record = this.#agents.get(agentId)
    if (!record) {
      throw new NotFoundError(`Agent "${agentId}" not found`)
    }

    // 处理 capabilities 变更：先清除旧索引
    if (patch.capabilities != null) {
      for (const cap of record.capabilities) {
        this.#removeFromSet(this.#byCapability, cap, agentId)
      }
    }

    // 处理 constraints：按子字段 merge
    const constraints = patch.constraints != null
      ? { ...record.constraints, ...patch.constraints }
      : record.constraints

    const { constraints: _c, ...restPatch } = patch
    const updated = Object.freeze({
      ...record,
      ...restPatch,
      constraints
    })

    this.#agents.set(agentId, updated)

    // 建立新的 capability 索引
    if (patch.capabilities != null) {
      for (const cap of updated.capabilities) {
        this.#getOrCreateSet(this.#byCapability, cap).add(agentId)
      }
    }

    return updated
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

    // 显式解构已知字段，防止任意字段注入
    const { load, activeTasks, queueDepth } = healthData

    const updated = Object.freeze({
      ...record,
      ...(load != null && { load }),
      ...(activeTasks != null && { activeTasks }),
      ...(queueDepth != null && { queueDepth }),
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

  /**
   * 返回所有 Agent
   *
   * @returns {import('../models/agent.js').AgentRecord[]}
   */
  listAll() {
    return [...this.#agents.values()]
  }

  /**
   * 获取所有已注册的能力目录
   *
   * @returns {Array<{ capability: string, description: string, agentCount: number }>}
   */
  getAllCapabilities() {
    const result = []
    for (const [capability, agentIds] of this.#byCapability) {
      const firstAgent = this.#agents.get(agentIds.values().next().value)
      result.push({
        capability,
        description: firstAgent?.description ?? '',
        agentCount: agentIds.size
      })
    }
    return result
  }

  /**
   * 检查某个能力是否已注册
   *
   * @param {string} capability
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.#byCapability.has(capability)
  }

  /**
   * 查找与给定能力名称最接近的已注册能力
   *
   * 匹配优先级：精确匹配（忽略大小写）→ 子字符串匹配 → `_` 分割词重叠
   *
   * @param {string} capability
   * @returns {string | null}
   */
  findClosestCapability(capability) {
    const lower = capability.toLowerCase()
    const allCaps = [...this.#byCapability.keys()]
    if (allCaps.length === 0) return null

    // 精确匹配（忽略大小写）
    const exact = allCaps.find(c => c.toLowerCase() === lower)
    if (exact) return exact

    // 子字符串匹配
    const substring = allCaps.find(c => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()))
    if (substring) return substring

    // `_` 分割词重叠匹配
    const queryWords = new Set(lower.split('_'))
    let bestMatch = null
    let bestScore = 0
    for (const cap of allCaps) {
      const capWords = new Set(cap.toLowerCase().split('_'))
      let overlap = 0
      for (const w of queryWords) {
        if (capWords.has(w)) overlap++
      }
      if (overlap > bestScore) {
        bestScore = overlap
        bestMatch = cap
      }
    }

    return bestMatch
  }

  /**
   * 获取活跃（非 offline）Agent 数量
   *
   * @returns {number}
   */
  getActiveCount() {
    const offlineCount = this.#byStatus.get('offline')?.size ?? 0
    return this.#agents.size - offlineCount
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
