/**
 * CircuitBreaker — Agent 熔断器
 *
 * 保护系统免受持续失败的 Agent 影响。
 * 状态机：closed → open → half_open → closed
 *
 * 触发条件：
 * - 连续失败 5 次
 * - 60s 时间窗口内失败率 > 50%（最少 5 次调用）
 *
 * 恢复机制：
 * - open 状态 30s 后转为 half_open
 * - half_open 允许一次试探调用
 *   - 成功 → closed
 *   - 失败 → 回到 open
 */

/** 熔断器状态 */
export const CIRCUIT_STATES = /** @type {const} */ ({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
})

/**
 * @typedef {Object} CircuitState
 * @property {string} agentId
 * @property {'closed'|'open'|'half_open'} state
 * @property {number} consecutiveFailures
 * @property {number} lastFailureAt
 * @property {number} openedAt
 * @property {{ success: number, failure: number }} windowCounts
 * @property {number} windowStartAt
 */

export class CircuitBreaker {
  /** @type {Map<string, CircuitState>} */
  #states = new Map()

  /** @type {number} 连续失败触发阈值 */
  #failureThreshold

  /** @type {number} 时间窗口(ms) */
  #windowMs

  /** @type {number} 窗口内失败率阈值 */
  #failureRateThreshold

  /** @type {number} open → half_open 的冷却时间(ms) */
  #cooldownMs

  /**
   * @param {Object} [options]
   * @param {number} [options.failureThreshold=5] - 连续失败触发阈值
   * @param {number} [options.windowMs=60000] - 统计窗口(ms)
   * @param {number} [options.failureRateThreshold=0.5] - 窗口内失败率阈值
   * @param {number} [options.cooldownMs=30000] - 冷却时间(ms)
   */
  constructor(options = {}) {
    this.#failureThreshold = options.failureThreshold ?? 5
    this.#windowMs = options.windowMs ?? 60_000
    this.#failureRateThreshold = options.failureRateThreshold ?? 0.5
    this.#cooldownMs = options.cooldownMs ?? 30_000
  }

  /**
   * 获取或初始化 Agent 的熔断状态
   *
   * @param {string} agentId
   * @returns {CircuitState}
   */
  #getOrCreate(agentId) {
    let state = this.#states.get(agentId)
    if (!state) {
      state = {
        agentId,
        state: CIRCUIT_STATES.CLOSED,
        consecutiveFailures: 0,
        lastFailureAt: 0,
        openedAt: 0,
        windowCounts: { success: 0, failure: 0 },
        windowStartAt: Date.now()
      }
      this.#states.set(agentId, state)
    }
    return state
  }

  /**
   * 滑动窗口过期则重置计数
   *
   * @param {CircuitState} state
   */
  #resetWindowIfNeeded(state) {
    const now = Date.now()
    if (now - state.windowStartAt >= this.#windowMs) {
      state.windowCounts = { success: 0, failure: 0 }
      state.windowStartAt = now
    }
  }

  /**
   * 记录一次成功
   *
   * @param {string} agentId
   */
  recordSuccess(agentId) {
    const state = this.#getOrCreate(agentId)
    this.#resetWindowIfNeeded(state)

    state.consecutiveFailures = 0
    state.windowCounts.success++

    if (state.state === CIRCUIT_STATES.HALF_OPEN) {
      // 试探成功，恢复为 closed
      state.state = CIRCUIT_STATES.CLOSED
      state.openedAt = 0
    }
  }

  /**
   * 记录一次失败
   *
   * @param {string} agentId
   */
  recordFailure(agentId) {
    const state = this.#getOrCreate(agentId)
    const now = Date.now()
    this.#resetWindowIfNeeded(state)

    state.consecutiveFailures++
    state.windowCounts.failure++
    state.lastFailureAt = now

    // half_open 状态下试探失败，回到 open
    if (state.state === CIRCUIT_STATES.HALF_OPEN) {
      state.state = CIRCUIT_STATES.OPEN
      state.openedAt = now
      return
    }

    // 检查是否应该触发熔断
    const shouldOpen =
      state.consecutiveFailures >= this.#failureThreshold ||
      this.#windowFailureRate(state) > this.#failureRateThreshold

    if (shouldOpen && state.state === CIRCUIT_STATES.CLOSED) {
      // 窗口内至少有 failureThreshold 次调用才触发窗口失败率
      const totalCalls = state.windowCounts.success + state.windowCounts.failure
      const triggeredByConsecutive = state.consecutiveFailures >= this.#failureThreshold
      const triggeredByRate = totalCalls >= this.#failureThreshold &&
        this.#windowFailureRate(state) > this.#failureRateThreshold

      if (triggeredByConsecutive || triggeredByRate) {
        state.state = CIRCUIT_STATES.OPEN
        state.openedAt = now
      }
    }
  }

  /**
   * 计算窗口内失败率
   *
   * @param {CircuitState} state
   * @returns {number}
   */
  #windowFailureRate(state) {
    const total = state.windowCounts.success + state.windowCounts.failure
    if (total === 0) return 0
    return state.windowCounts.failure / total
  }

  /**
   * 检查 Agent 是否被熔断（不可用于调度）
   *
   * **副作用**：此方法会触发状态转换。当 Agent 处于 open 状态且
   * 冷却期已过时，会自动转为 half_open 并返回 false（允许试探）。
   * 调用者应意识到此方法不仅是查询，还可能改变内部状态。
   *
   * @param {string} agentId
   * @returns {boolean} true 表示被熔断，不应参与调度
   */
  isOpen(agentId) {
    const state = this.#getOrCreate(agentId)

    if (state.state === CIRCUIT_STATES.CLOSED) {
      return false
    }

    if (state.state === CIRCUIT_STATES.OPEN) {
      // 检查是否已过冷却期
      const now = Date.now()
      if (now - state.openedAt >= this.#cooldownMs) {
        state.state = CIRCUIT_STATES.HALF_OPEN
        return false // 允许一次试探
      }
      return true
    }

    // HALF_OPEN 状态允许调度（试探）
    return false
  }

  /**
   * 获取 Agent 的熔断状态
   *
   * @param {string} agentId
   * @returns {'closed'|'open'|'half_open'}
   */
  getState(agentId) {
    // 触发状态转换检查
    this.isOpen(agentId)
    return this.#getOrCreate(agentId).state
  }

  /**
   * 手动重置 Agent 的熔断状态
   *
   * @param {string} agentId
   */
  reset(agentId) {
    this.#states.delete(agentId)
  }

  /**
   * 获取所有处于 open 状态的 Agent ID
   *
   * 注意：此方法不触发状态转换（不会将 open → half_open），
   * 仅用于查询快照。如需触发恢复检查，请使用 isOpen()。
   *
   * @returns {string[]}
   */
  getOpenAgents() {
    const result = []
    for (const [agentId, state] of this.#states) {
      if (state.state === CIRCUIT_STATES.OPEN) {
        result.push(agentId)
      }
    }
    return result
  }
}
