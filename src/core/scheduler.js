/**
 * Scheduler — 任务调度器
 *
 * 根据能力需求和健康状态，从 Hive 注册表中选择最合适的 Agent。
 * 调度策略：能力过滤 → 健康过滤 → 负载排序（取 load 最低）
 */

import { UnavailableError } from '../utils/errors.js'

/** 不参与调度的状态 */
const UNHEALTHY_STATUSES = new Set(['error', 'offline'])

export class Scheduler {
  /** @type {import('./hive.js').Hive} */
  #hive

  /**
   * @param {{ hive: import('./hive.js').Hive }} deps
   */
  constructor({ hive }) {
    this.#hive = hive
  }

  /**
   * 根据能力需求选择最优 Agent
   *
   * 筛选流程：
   * 1. 能力过滤 — 只保留拥有指定 capability 的 Agent
   * 2. 健康过滤 — 排除 error / offline 状态
   * 3. 负载排序 — 取 load 最低的，同 load 时取 activeTasks 最少的
   *
   * @param {string} capability - 需要的能力
   * @returns {import('../models/agent.js').AgentRecord}
   * @throws {UnavailableError} 没有可用的 Agent
   */
  selectAgent(capability) {
    if (!capability) {
      throw new UnavailableError('Capability is required for agent selection')
    }

    // 1. 能力过滤（Hive 的 O(1) 索引）
    const candidates = this.#hive.findByCapability(capability, { activeOnly: true })

    if (candidates.length === 0) {
      throw new UnavailableError(
        `No available agent with capability "${capability}"`
      )
    }

    // 2. 健康过滤（排除 error/offline，findByCapability activeOnly 只排除了 offline）
    const healthy = candidates.filter(
      agent => !UNHEALTHY_STATUSES.has(agent.status)
    )

    if (healthy.length === 0) {
      throw new UnavailableError(
        `No healthy agent with capability "${capability}"`
      )
    }

    // 3. 负载排序：load 最低 → activeTasks 最少 → 按 agentId 稳定排序
    healthy.sort((a, b) => {
      if (a.load !== b.load) return a.load - b.load
      if (a.activeTasks !== b.activeTasks) return a.activeTasks - b.activeTasks
      return a.agentId.localeCompare(b.agentId)
    })

    return healthy[0]
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

    // 1. 能力过滤
    const candidates = this.#hive.findByCapability(capability, { activeOnly: true })

    if (candidates.length === 0) {
      throw new UnavailableError(
        `No available agent with capability "${capability}"`
      )
    }

    // 2. 排除指定的 Agent ID
    const filtered = candidates.filter(
      agent => !excludeAgentIds.includes(agent.agentId)
    )

    if (filtered.length === 0) {
      throw new UnavailableError(
        `No available agent with capability "${capability}" after excluding ${excludeAgentIds.length} agent(s)`
      )
    }

    // 3. 健康过滤
    const healthy = filtered.filter(
      agent => !UNHEALTHY_STATUSES.has(agent.status)
    )

    if (healthy.length === 0) {
      throw new UnavailableError(
        `No healthy agent with capability "${capability}" after excluding ${excludeAgentIds.length} agent(s)`
      )
    }

    // 4. 负载排序
    healthy.sort((a, b) => {
      if (a.load !== b.load) return a.load - b.load
      if (a.activeTasks !== b.activeTasks) return a.activeTasks - b.activeTasks
      return a.agentId.localeCompare(b.agentId)
    })

    return healthy[0]
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
    return !UNHEALTHY_STATUSES.has(agent.status)
  }
}
