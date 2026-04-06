/**
 * Planner — 任务规划器
 *
 * 根据任务描述分析所需的执行策略和步骤。
 * MVP 基于关键词规则，analyzePlan 声明为 async 预留模型接口。
 */

import { genConvId } from '../utils/id.js'
import { createTaskRecord } from '../models/task.js'

/** 内置关键词映射：关键词 → capability */
const KEYWORD_CAPABILITY_MAP = {
  search: 'search',
  搜索: 'search',
  code_generation: 'code_generation',
  代码: 'code_generation',
  生成: 'code_generation',
  code: 'code_generation',
  data_analysis: 'data_analysis',
  分析: 'data_analysis',
  data: 'data_analysis',
  debugging: 'debugging',
  调试: 'debugging',
  debug: 'debugging',
  visualization: 'visualization',
  可视化: 'visualization',
  chart: 'visualization'
}

/** 顺序依赖关键词 */
const SEQUENTIAL_KEYWORDS = ['然后', '之后', '再', '接着', 'then', 'after', 'and then']

/**
 * 从 description 中提取能力列表
 *
 * 优先匹配 Hive 中已注册的 capability 名称，
 * 其次匹配内置关键词映射。
 *
 * @param {string} description - 任务描述
 * @param {string[]} registeredCapabilities - Hive 中已注册的能力列表
 * @returns {string[]} 匹配到的能力列表（去重，保持顺序）
 */
function extractCapabilities(description, registeredCapabilities) {
  const lower = description.toLowerCase()
  const seen = new Set()
  const result = []

  // 优先匹配已注册的 capability 名称
  for (const cap of registeredCapabilities) {
    if (lower.includes(cap.toLowerCase()) && !seen.has(cap)) {
      seen.add(cap)
      result.push(cap)
    }
  }

  // 其次匹配内置关键词映射
  for (const [keyword, cap] of Object.entries(KEYWORD_CAPABILITY_MAP)) {
    if (lower.includes(keyword) && !seen.has(cap)) {
      seen.add(cap)
      result.push(cap)
    }
  }

  return result
}

/**
 * 检测描述中是否包含顺序依赖关键词
 *
 * @param {string} description
 * @returns {boolean}
 */
function hasSequentialDependency(description) {
  return SEQUENTIAL_KEYWORDS.some(kw => description.includes(kw))
}

export class Planner {
  /** @type {import('./hive.js').Hive} */
  #hive

  /**
   * @param {{ hive: import('./hive.js').Hive }} deps
   */
  constructor({ hive }) {
    this.#hive = hive
  }

  /**
   * 分析任务描述，生成执行计划
   *
   * MVP 基于规则（关键词匹配），但声明为 async 预留模型接口。
   *
   * 规则：
   * 1. 扫描 description 中的能力关键词
   * 2. 匹配到 0 个 → single，使用第一个可用 Agent 的能力
   * 3. 匹配到 1 个 → single
   * 4. 匹配到多个，有顺序依赖 → serial
   * 5. 匹配到多个，无顺序依赖 → parallel
   *
   * @param {string} description - 任务描述
   * @param {Object} [options]
   * @param {any} [options.input] - 用户输入
   * @param {string} [options.expectedOutput] - 期望输出
   * @param {Object} [options.constraints] - 约束
   * @returns {Promise<{ conversationId: string, strategy: 'single'|'serial'|'parallel', steps: Array<{ capability: string, description: string }> }>}
   */
  async analyzePlan(description, options = {}) {
    // 收集 Hive 中所有已注册的 capabilities
    const registeredCapabilities = this.#getRegisteredCapabilities()

    const capabilities = extractCapabilities(description, registeredCapabilities)

    let strategy
    let stepDescriptions

    if (capabilities.length === 0) {
      // 无匹配 → single，使用通用描述
      strategy = 'single'
      stepDescriptions = [{ capability: 'general', description }]
    } else if (capabilities.length === 1) {
      strategy = 'single'
      stepDescriptions = [{ capability: capabilities[0], description }]
    } else {
      const isSequential = hasSequentialDependency(description)
      strategy = isSequential ? 'serial' : 'parallel'
      stepDescriptions = capabilities.map(cap => ({
        capability: cap,
        description: `${cap} 步骤`
      }))
    }

    return {
      conversationId: genConvId(),
      strategy,
      steps: stepDescriptions.map((s, i) => ({
        stepIndex: i,
        capability: s.capability,
        description: s.description
      }))
    }
  }

  /**
   * 收集 Hive 中所有已注册的 capabilities
   * @returns {string[]}
   */
  #getRegisteredCapabilities() {
    const caps = new Set()
    // Hive 没有直接列出所有 capability 的方法，遍历所有 agent
    // 这里用 findByStatus 来获取所有 agent
    for (const status of ['idle', 'busy', 'error']) {
      for (const agent of this.#hive.findByStatus(status)) {
        for (const cap of agent.capabilities) {
          caps.add(cap)
        }
      }
    }
    // 也检查 offline 的，因为能力名仍可用于关键词匹配
    for (const agent of this.#hive.findByStatus('offline')) {
      for (const cap of agent.capabilities) {
        caps.add(cap)
      }
    }
    return [...caps]
  }
}

/**
 * 从执行计划构建 TaskRecord
 *
 * @param {Object} plan - analyzePlan 的返回值
 * @param {string} plan.conversationId
 * @param {string} plan.strategy
 * @param {Array<{ stepIndex: number, capability: string, description: string }>} plan.steps
 * @param {Object} originalRequest - 原始请求
 * @param {string} originalRequest.description
 * @param {any} [originalRequest.input]
 * @param {string} [originalRequest.expectedOutput]
 * @param {Object} [originalRequest.constraints]
 * @returns {import('../models/task.js').TaskRecord}
 */
export function buildTasksFromPlan(plan, originalRequest) {
  return createTaskRecord({
    conversationId: plan.conversationId,
    strategy: plan.strategy,
    request: originalRequest,
    steps: plan.steps
  })
}
