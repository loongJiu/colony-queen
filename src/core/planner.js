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
  写: 'code_generation',
  编写: 'code_generation',
  实现: 'code_generation',
  开发: 'code_generation',
  程序: 'code_generation',
  函数: 'code_generation',
  code_review: 'code_review',
  审查: 'code_review',
  review: 'code_review',
  代码审查: 'code_review',
  data_analysis: 'data_analysis',
  分析: 'data_analysis',
  data: 'data_analysis',
  数据: 'data_analysis',
  debugging: 'debugging',
  调试: 'debugging',
  debug: 'debugging',
  修复: 'debugging',
  bug: 'debugging',
  text_writing: 'text_writing',
  文本: 'text_writing',
  写作: 'text_writing',
  文档: 'text_writing',
  文章: 'text_writing',
  planning: 'planning',
  规划: 'planning',
  计划: 'planning',
  方案: 'planning',
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
  /** @type {import('../services/llm-client.js').LLMClient | null} */
  #llmClient
  /** @type {boolean} */
  #fallbackEnabled
  /** @type {object} */
  #logger

  /**
   * @param {{
   *   hive: import('./hive.js').Hive,
   *   llmClient?: import('../services/llm-client.js').LLMClient | null,
   *   fallbackEnabled?: boolean,
   *   logger?: object
   * }} deps
   */
  constructor({ hive, llmClient = null, fallbackEnabled = true, logger = console }) {
    this.#hive = hive
    this.#llmClient = llmClient
    this.#fallbackEnabled = fallbackEnabled
    this.#logger = logger
  }

  /**
   * 分析任务描述，生成执行计划
   *
   * 优先使用 LLM 规划，失败时降级到基于规则的规划。
   *
   * @param {string} description - 任务描述
   * @param {Object} [options]
   * @param {any} [options.input] - 用户输入
   * @param {string} [options.expectedOutput] - 期望输出
   * @param {Object} [options.constraints] - 约束
   * @returns {Promise<{ conversationId: string, strategy: 'single'|'serial'|'parallel', steps: Array<{ capability: string, description: string }> }>}
   */
  async analyzePlan(description, options = {}) {
    // 尝试 LLM 规划
    if (this.#llmClient?.isConfigured) {
      try {
        const plan = await this.#modelBased(description, options)
        if (plan) return plan
      } catch (err) {
        this.#logger.warn?.({ err: err.message }, 'LLM planning failed, falling back to rule-based')
        if (!this.#fallbackEnabled) throw err
        // 降级到规则引擎
      }
    }

    // 规则引擎（原有逻辑）
    return this.#ruleBased(description)
  }

  /**
   * 基于规则的规划（原有逻辑）
   *
   * 规则：
   * 1. 扫描 description 中的能力关键词
   * 2. 匹配到 0 个 → single，使用 general
   * 3. 匹配到 1 个 → single
   * 4. 匹配到多个，有顺序依赖 → serial
   * 5. 匹配到多个，无顺序依赖 → parallel
   */
  #ruleBased(description) {
    const registeredCapabilities = this.#getRegisteredCapabilities()

    const capabilities = extractCapabilities(description, registeredCapabilities)

    let strategy
    let stepDescriptions

    if (capabilities.length === 0) {
      // 无关键词匹配 → 使用第一个已注册能力，若无已注册能力则 fallback 到 general
      strategy = 'single'
      const fallbackCap = registeredCapabilities.length > 0 ? registeredCapabilities[0] : 'general'
      stepDescriptions = [{ capability: fallbackCap, description }]
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
   * 基于 LLM 的智能规划
   *
   * @param {string} description
   * @param {Object} options
   * @returns {Promise<{ conversationId: string, strategy: string, steps: Array }>}
   */
  async #modelBased(description, options = {}) {
    const capabilities = this.#hive.getAllCapabilities()
    if (capabilities.length === 0) return null

    const capabilityList = capabilities
      .map(c => `- ${c.capability} (${c.agentCount}个Agent): ${c.description || c.capability}`)
      .join('\n')

    const systemPrompt = `你是 Colony 系统的任务规划器，负责将用户的自然语言需求拆解为可执行的步骤序列。

## 当前可用的 Agent 能力
${capabilityList}

## 规划规则
1. 只能使用上面列出的 capability，禁止使用列表之外的能力
2. 如果多个步骤之间没有数据依赖，使用 parallel 策略
3. 如果步骤 B 需要步骤 A 的输出，使用 serial 策略
4. 如果一个步骤即可完成，使用 single 策略

## 输出格式（严格 JSON，不要包含 markdown 代码块标记）
{
  "strategy": "single | serial | parallel",
  "steps": [
    { "capability": "能力名", "description": "步骤描述" }
  ]
}`

    const userPrompt = `任务描述: ${description}
${options.input ? `输入数据: ${JSON.stringify(options.input)}` : ''}
${options.expectedOutput ? `期望输出: ${options.expectedOutput}` : ''}
${options.constraints ? `约束条件: ${JSON.stringify(options.constraints)}` : ''}`

    const raw = await this.#llmClient.complete(userPrompt, {
      systemPrompt,
      temperature: 0.2
    })

    return this.#parsePlan(raw)
  }

  /**
   * 解析并验证 LLM 响应为执行计划
   *
   * @param {string} raw - LLM 原始响应文本
   * @returns {{ conversationId: string, strategy: string, steps: Array }}
   * @throws {Error} 解析失败或验证失败
   */
  #parsePlan(raw) {
    // 去除 markdown 代码块包裹
    let cleaned = raw.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error(`LLM response is not valid JSON: ${cleaned.slice(0, 200)}`)
    }

    // 验证 strategy
    const validStrategies = ['single', 'serial', 'parallel']
    if (!validStrategies.includes(parsed.strategy)) {
      throw new Error(`LLM returned invalid strategy: ${parsed.strategy}`)
    }

    // 验证 steps
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error('LLM returned empty or invalid steps array')
    }

    for (const step of parsed.steps) {
      if (!step.capability || typeof step.capability !== 'string') {
        throw new Error(`LLM returned step with missing capability: ${JSON.stringify(step)}`)
      }
    }

    // 验证 capability 引用是否真实存在
    const registeredCapabilities = this.#getRegisteredCapabilities()
    const unknownCaps = parsed.steps
      .map(s => s.capability)
      .filter(cap => !registeredCapabilities.includes(cap))

    if (unknownCaps.length > 0) {
      throw new Error(`LLM referenced unknown capabilities: ${unknownCaps.join(', ')}`)
    }

    return {
      conversationId: genConvId(),
      strategy: parsed.strategy,
      steps: parsed.steps.map((s, i) => ({
        stepIndex: i,
        capability: s.capability,
        description: s.description ?? `${s.capability} 步骤`
      }))
    }
  }

  /**
   * 可用性预检 — 在任务进入队列前检查可行性
   *
   * 提取任务描述所需的 capabilities，检查是否有活跃 Agent 能执行。
   * 不调用 LLM，纯规则匹配，保证速度。
   *
   * @param {string} description - 任务描述
   * @returns {{ feasible: boolean, missingCapabilities: string[], availableCapabilities: Array<{ capability: string, activeAgents: number }>, totalActiveAgents: number, suggestions: Array<{ requested: string, closest: string|null }> }}
   */
  precheck(description) {
    const registeredCapabilities = this.#getRegisteredCapabilities()
    const requiredCapabilities = extractCapabilities(description, registeredCapabilities)

    const missing = []
    const available = []

    for (const cap of requiredCapabilities) {
      const activeAgents = this.#hive.findByCapability(cap, { activeOnly: true })
      if (activeAgents.length === 0) {
        missing.push(cap)
      } else {
        available.push({ capability: cap, activeAgents: activeAgents.length })
      }
    }

    // 对缺失能力生成建议
    const suggestions = missing.map(cap => ({
      requested: cap,
      closest: this.#hive.findClosestCapability(cap)
    }))

    return {
      feasible: missing.length === 0,
      missingCapabilities: missing,
      availableCapabilities: available,
      totalActiveAgents: this.#hive.getActiveCount(),
      suggestions
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
