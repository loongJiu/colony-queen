/**
 * Scheduler v3.0 — 基于能力画像的加权调度器
 *
 * 在 v2（负载排序）基础上引入能力画像加权调度：
 * 1. 能力过滤 → 健康过滤 → 熔断过滤（新增）
 * 2. 有画像时：computeWeight 计算综合权重 → softmax 采样
 * 3. 无画像时：退化为 v2 的负载排序（向后兼容）
 * 4. 冷启动保护：taskCount < 10 的 Agent 给予基础权重 0.6
 *
 * selectAgent / selectAgentExcluding 保持同步签名，
 * 画像数据通过 refreshProfiles() 预加载到内存缓存。
 */

import { UnavailableError } from '../utils/errors.js'

/** 不参与调度的状态 */
const UNHEALTHY_STATUSES = new Set(['error', 'offline'])

/** 冷启动阈值 */
const COLD_START_THRESHOLD = 10

/** 冷启动基础权重 */
const COLD_START_WEIGHT = 0.6

/** softmax 温度参数（越高越随机，越低越贪心） */
const SOFTMAX_TEMPERATURE = 0.5

/** 亲和性加成系数（串行任务中同 Agent 复用权重倍数） */
const AFFINITY_BOOST = 1.3

export class Scheduler {
  /** @type {import('./hive.js').Hive} */
  #hive

  /** @type {import('../services/circuit-breaker.js').CircuitBreaker | null} */
  #circuitBreaker

  /** @type {import('../storage/memory-store.js').MemoryStore | null} */
  #store

  /** @type {Map<string, import('../models/capability-profile.js').CapabilityProfile>} agentId:capability → Profile 缓存 */
  #profileCache = new Map()

  /**
   * @param {{ hive: import('./hive.js').Hive, circuitBreaker?: import('../services/circuit-breaker.js').CircuitBreaker, store?: Object }} deps
   */
  constructor({ hive, circuitBreaker = null, store = null } = {}) {
    this.#hive = hive
    this.#circuitBreaker = circuitBreaker
    this.#store = store
  }

  /**
   * 刷新画像缓存（异步，由上层定期或事件触发调用）
   *
   * @returns {Promise<void>}
   */
  async refreshProfiles() {
    if (!this.#store) return

    const agents = this.#hive.listAll()
    const newCache = new Map()

    for (const agent of agents) {
      for (const cap of agent.capabilities) {
        try {
          const profile = await this.#store.getProfile(agent.agentId, cap)
          if (profile) {
            newCache.set(`${agent.agentId}:${cap}`, profile)
          }
        } catch {
          // 画像查询失败不应阻塞
        }
      }
    }

    this.#profileCache = newCache
  }

  /**
   * 更新单个 Agent 的画像缓存
   *
   * @param {import('../models/capability-profile.js').CapabilityProfile} profile
   */
  updateProfileCache(profile) {
    this.#profileCache.set(`${profile.agentId}:${profile.capability}`, profile)
  }

  /**
   * 根据能力需求选择最优 Agent
   *
   * 筛选流程：
   * 1. 能力过滤 — 只保留拥有指定 capability 的 Agent
   * 2. 健康过滤 — 排除 error / offline 状态
   * 3. 熔断过滤 — 排除被熔断的 Agent
   * 4. 加权选择 — 有画像时 softmax 采样，无画像时负载排序
   *
   * @param {string} capability - 需要的能力
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {UnavailableError} 没有可用的 Agent
   */
  selectAgent(capability) {
    if (!capability) {
      throw new UnavailableError('Capability is required for agent selection')
    }

    const candidates = this.#filterCandidates(capability)

    if (candidates.length === 0) {
      throw new UnavailableError(
        `No available agent with capability "${capability}"`
      )
    }

    // 加载画像缓存
    const profiles = this.#getCachedProfiles(candidates, capability)

    // 有画像数据时使用加权调度
    if (profiles.size > 0) {
      return this.#weightedSelect(candidates, profiles)
    }

    // 无画像时退化为负载排序
    return this.#loadBalanceSelect(candidates)
  }

  /**
   * 选择 Agent，排除指定的 ID 列表
   *
   * 用于重试场景：排除已失败的 Agent，重新选择可用 Agent。
   *
   * @param {string} capability - 需要的能力
   * @param {string[]} excludeAgentIds - 排除的 Agent ID 列表
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {UnavailableError} 没有可用的 Agent
   */
  selectAgentExcluding(capability, excludeAgentIds = []) {
    if (!capability) {
      throw new UnavailableError('Capability is required for agent selection')
    }

    const candidates = this.#filterCandidates(capability, excludeAgentIds)

    if (candidates.length === 0) {
      throw new UnavailableError(
        `No available agent with capability "${capability}" after excluding ${excludeAgentIds.length} agent(s)`
      )
    }

    // 加载画像缓存
    const profiles = this.#getCachedProfiles(candidates, capability)

    if (profiles.size > 0) {
      return this.#weightedSelect(candidates, profiles)
    }

    return this.#loadBalanceSelect(candidates)
  }

  /**
   * 选择 Agent，支持亲和性偏好
   *
   * 用于串行任务中：当同一 capability 在多个步骤中出现时，
   * 偏好已成功处理过该 capability 的 Agent（上下文连续性）。
   *
   * @param {string} capability - 需要的能力
   * @param {Object} [options]
   * @param {string[]} [options.excludeIds] - 排除的 Agent ID 列表（重试场景）
   * @param {string[]} [options.preferredAgentIds] - 亲和偏好的 Agent ID 列表
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {UnavailableError} 没有可用的 Agent
   */
  selectAgentWithAffinity(capability, { excludeIds = [], preferredAgentIds = [] } = {}) {
    if (!capability) {
      throw new UnavailableError('Capability is required for agent selection')
    }

    const candidates = this.#filterCandidates(capability, excludeIds)

    if (candidates.length === 0) {
      throw new UnavailableError(
        `No available agent with capability "${capability}"${excludeIds.length > 0 ? ` after excluding ${excludeIds.length} agent(s)` : ''}`
      )
    }

    const profiles = this.#getCachedProfiles(candidates, capability)

    if (profiles.size > 0) {
      return this.#weightedSelect(candidates, profiles, preferredAgentIds)
    }

    return this.#loadBalanceSelect(candidates, preferredAgentIds)
  }

  /**
   * 检查指定 Agent 是否可用于调度
   *
   * @param {string} agentId
   * @returns {boolean}
   */
  isAvailable(agentId) {
    const agent = this.#hive.get(agentId)
    if (!agent) return false
    if (UNHEALTHY_STATUSES.has(agent.status)) return false
    // 熔断检查
    if (this.#circuitBreaker && this.#circuitBreaker.isOpen(agentId)) return false
    return true
  }

  // ── 内部方法 ──────────────────────────────────

  /**
   * 过滤候选 Agent：能力 → 健康 → 排除 → 熔断
   *
   * @param {string} capability
   * @param {string[]} [excludeIds]
   * @returns {import('../models/agent.js').AgentRecord[]}
   */
  #filterCandidates(capability, excludeIds = []) {
    const candidates = this.#hive.findByCapability(capability, { activeOnly: true })

    const filtered = candidates.filter(agent => {
      // 健康过滤
      if (UNHEALTHY_STATUSES.has(agent.status)) return false
      // 排除过滤
      if (excludeIds.includes(agent.agentId)) return false
      // 熔断过滤
      if (this.#circuitBreaker && this.#circuitBreaker.isOpen(agent.agentId)) return false
      return true
    })

    return filtered
  }

  /**
   * 从内存缓存获取画像数据
   *
   * @param {import('../models/agent.js').AgentRecord[]} candidates
   * @param {string} capability
   * @returns {Map<string, import('../models/capability-profile.js').CapabilityProfile>}
   */
  #getCachedProfiles(candidates, capability) {
    const profiles = new Map()
    for (const agent of candidates) {
      const profile = this.#profileCache.get(`${agent.agentId}:${capability}`)
      if (profile) {
        profiles.set(agent.agentId, profile)
      }
    }
    return profiles
  }

  /**
   * 基于 softmax 采样的加权选择
   *
   * @param {import('../models/agent.js').AgentRecord[]} candidates
   * @param {Map<string, import('../models/capability-profile.js').CapabilityProfile>} profiles
   * @returns {import('../models/agent.js').AgentRecord}
   */
  #weightedSelect(candidates, profiles, preferredAgentIds = []) {
    const weights = candidates.map(agent => {
      const profile = profiles.get(agent.agentId)
      if (!profile) {
        return preferredAgentIds.includes(agent.agentId) ? COLD_START_WEIGHT * AFFINITY_BOOST : COLD_START_WEIGHT
      }
      return this.computeWeight(agent, profile, preferredAgentIds.includes(agent.agentId))
    })

    return softmaxSample(candidates, weights, SOFTMAX_TEMPERATURE)
  }

  /**
   * 负载排序选择（v2 兼容）
   *
   * @param {import('../models/agent.js').AgentRecord[]} candidates
   * @returns {import('../models/agent.js').AgentRecord}
   */
  #loadBalanceSelect(candidates, preferredAgentIds = []) {
    candidates.sort((a, b) => {
      const aPreferred = preferredAgentIds.includes(a.agentId)
      const bPreferred = preferredAgentIds.includes(b.agentId)
      // 亲和优先
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1
      if (a.load !== b.load) return a.load - b.load
      if (a.activeTasks !== b.activeTasks) return a.activeTasks - b.activeTasks
      return a.agentId.localeCompare(b.agentId)
    })
    return candidates[0]
  }

  /**
   * 计算单个 Agent 的调度权重
   *
   * 综合画像得分、负载、趋势计算权重。
   * 冷启动（taskCount < 10）给予固定基础权重。
   *
   * @param {import('../models/agent.js').AgentRecord} agent
   * @param {import('../models/capability-profile.js').CapabilityProfile} profile
   * @returns {number}
   */
  computeWeight(agent, profile, hasAffinity = false) {
    // 冷启动保护
    if (profile.taskCount < COLD_START_THRESHOLD) {
      const weight = hasAffinity ? COLD_START_WEIGHT * AFFINITY_BOOST : COLD_START_WEIGHT
      return Math.max(0.1, Math.min(1, weight))
    }

    // 基础权重：画像实际得分
    let weight = profile.actualScore

    // 趋势调整
    if (profile.recentTrend === 'improving') {
      weight *= 1.05
    } else if (profile.recentTrend === 'declining') {
      weight *= 0.9
    }

    // 负载惩罚
    weight = weight * (1 - agent.load * 0.5)

    // 成功率混入
    weight = weight * 0.6 + profile.successRate * 0.4

    // 亲和性加成
    if (hasAffinity) weight *= AFFINITY_BOOST

    return Math.max(0.1, Math.min(1, weight))
  }
}

/**
 * softmax 采样：将权重转为概率分布后按概率随机选择
 *
 * @template T
 * @param {T[]} items
 * @param {number[]} weights
 * @param {number} temperature
 * @returns {T}
 */
function softmaxSample(items, weights, temperature) {
  if (items.length === 1) return items[0]

  // 数值稳定：减去最大值避免溢出
  const maxW = Math.max(...weights)
  const exps = weights.map(w => Math.exp((w - maxW) / temperature))
  const sumExps = exps.reduce((a, b) => a + b, 0)
  const probs = exps.map(e => e / sumExps)

  // 按概率采样
  const rand = Math.random()
  let cumulative = 0
  for (let i = 0; i < items.length; i++) {
    cumulative += probs[i]
    if (rand < cumulative) {
      return items[i]
    }
  }

  // 浮点精度兜底
  return items[items.length - 1]
}
