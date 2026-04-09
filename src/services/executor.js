/**
 * Executor — 任务执行器
 *
 * 根据 TaskRecord 的 strategy 执行任务步骤，
 * 通过 HTTP 向 Worker 发送 task_assign 并收集 task_result。
 * 使用 AbortController 处理超时。
 * 状态变更采用「替换而非修改」模式，#tasks 中始终存储冻结对象。
 */

import { createStepResult } from '../models/task.js'

export class Executor {
  /** @type {import('../core/scheduler.js').Scheduler} */
  #scheduler

  /** @type {import('./retry.js').RetryService | null} */
  #retryService

  /** @type {Object} */
  #logger

  /** @type {Map<string, import('../models/task.js').TaskRecord>} taskId → TaskRecord（不可变，每次状态变更创建新冻结对象替换） */
  #tasks = new Map()

  /** @type {Map<string, AbortController>} taskId → AbortController */
  #abortControllers = new Map()

  /** @type {Map<string, Array<{ taskId: string, source: string, message: string, timestamp: number }>>} taskId → 日志 */
  #taskLogs = new Map()

  /** @type {number} 默认超时（ms） */
  #defaultTimeout

  /**
   * @param {{
   *   scheduler: import('../core/scheduler.js').Scheduler,
   *   retryService?: import('./retry.js').RetryService,
   *   logger?: Object,
   *   defaultTimeoutMs?: number
   * }} deps
   */
  /**
   * @type {number} 最大重试次数
   */
  #maxRetry

  /** @type {import('../utils/event-bus.js').EventBus | null} */
  #eventBus

  constructor({ scheduler, retryService = null, logger = console, defaultTimeoutMs = 30000, maxRetry = 3, eventBus = null }) {
    this.#scheduler = scheduler
    this.#retryService = retryService
    this.#logger = logger
    this.#defaultTimeout = defaultTimeoutMs
    this.#maxRetry = maxRetry
    this.#eventBus = eventBus
  }

  /**
   * 执行一个已创建的 TaskRecord
   *
   * 根据 task.strategy 分发到对应方法，
   * 更新 task 状态并返回最终结果。
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @returns {Promise<import('../models/task.js').TaskRecord>}
   */
  async run(task) {
    this.#logger.info({ taskId: task.taskId, strategy: task.strategy, steps: task.steps.length }, 'task execution started')

    this.#emitLog(task.taskId, 'executor', `任务开始执行，策略: ${task.strategy}，共 ${task.steps.length} 步`)

    // 重放规划阶段日志
    if (task.planLogs?.length > 0) {
      for (const log of task.planLogs) {
        this.#eventBus?.emit('task.log', {
          taskId: task.taskId,
          source: log.source || 'planner',
          message: log.message,
          timestamp: log.timestamp
        })
      }
    }

    // 初始化：置为 running 状态，存入不可变副本
    // 保留已有的成功结果（断点续跑支持）
    const existingResults = (task.results ?? []).filter(r => r.status === 'success')
    const running = this.#updateTask(task, { results: existingResults, status: 'running', startedAt: task.startedAt ?? Date.now() })

    const abortController = new AbortController()
    this.#abortControllers.set(task.taskId, abortController)

    try {
      let final
      switch (task.strategy) {
        case 'single':
          final = await this.#executeSingle(running, abortController)
          break
        case 'serial':
          final = await this.#executeSerial(running, abortController)
          break
        case 'parallel':
          final = await this.#executeParallel(running, abortController)
          break
        default:
          final = this.#updateTask(running, { status: 'failure', finishedAt: Date.now() })
      }

      return final
    } finally {
      this.#abortControllers.delete(task.taskId)
    }
  }

  /**
   * 查询任务状态
   *
   * @param {string} taskId
   * @returns {import('../models/task.js').TaskRecord | undefined}
   */
  getTask(taskId) {
    return this.#tasks.get(taskId)
  }

  /**
   * 取消任务
   *
   * 触发 AbortController，将任务标记为 cancelled。
   *
   * @param {string} taskId
   * @returns {boolean} 是否成功取消
   */
  cancel(taskId) {
    const abortController = this.#abortControllers.get(taskId)
    if (!abortController) return false

    this.#logger.info({ taskId }, 'task cancel requested')
    this.#emitLog(taskId, 'executor', '任务取消请求已收到')
    abortController.abort()

    const task = this.#tasks.get(taskId)
    if (task && task.status === 'running') {
      this.#updateTask(task, { status: 'cancelled', finishedAt: Date.now() })
    }

    return true
  }

  /**
   * 列出所有任务
   *
   * @returns {import('../models/task.js').TaskRecord[]}
   */
  listTasks() {
    return [...this.#tasks.values()]
  }

  /**
   * 获取指定 Agent 执行中的任务
   *
   * @param {string} agentId
   * @returns {import('../models/task.js').TaskRecord[]}
   */
  getTasksByAgent(agentId) {
    return [...this.#tasks.values()].filter(task =>
      task.results.some(r => r.agentId === agentId) &&
      (task.status === 'running' || task.status === 'pending')
    )
  }

  /**
   * 获取指定任务的日志
   *
   * @param {string} taskId
   * @returns {Array<{ taskId: string, source: string, message: string, timestamp: number }>}
   */
  getTaskLogs(taskId) {
    return this.#taskLogs.get(taskId) ?? []
  }

  // ── 内部执行方法 ──────────────────────────────

  /**
   * 串行执行多步任务
   *
   * 前一步的 output 作为下一步的 input。
   * 任一步失败则尝试重试，重试耗尽则停止，标记整体为 failure。
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {AbortController} abortController
   * @returns {Promise<import('../models/task.js').TaskRecord>}
   */
  async #executeSerial(task, abortController) {
    const timeoutMs = this.#resolveTimeout(task)
    const log = this.#childLog({ taskId: task.taskId, strategy: 'serial' })

    // 断点续跑：利用 task 中已有的成功结果，跳过已完成步骤
    const existingResults = (task.results ?? []).filter(r => r.status === 'success')
    const results = [...existingResults]
    const firstPendingIndex = existingResults.length
    let current = task

    if (firstPendingIndex > 0) {
      log.info({ completedSteps: firstPendingIndex, totalSteps: task.steps.length }, 'resuming from checkpoint')
      this.#emitLog(task.taskId, 'executor', `从断点续跑，跳过已完成的 ${firstPendingIndex} 步`)
    }

    for (let i = firstPendingIndex; i < task.steps.length; i++) {
      if (abortController.signal.aborted) {
        log.info({ stepIndex: i }, 'task cancelled by abort signal')
        return this.#updateTask(current, { results, status: 'cancelled', finishedAt: Date.now() })
      }

      const step = task.steps[i]
      const prevOutput = i > 0 && results[i - 1]?.status === 'success'
        ? results[i - 1].output
        : undefined
      const stepInput = i === 0 ? task.request?.input : prevOutput

      log.info({ stepIndex: i, capability: step.capability }, 'serial step start')
      this.#emitLog(task.taskId, 'executor', `串行步骤 ${i + 1}/${task.steps.length} 开始，能力: ${step.capability}`, { stepIndex: i, capability: step.capability })

      // 执行步骤（支持重试）
      let stepResult = await this.#executeStep(
        { ...step, input: stepInput },
        task.conversationId,
        task.taskId,
        abortController,
        timeoutMs
      )

      // 如果失败且可重试，使用 RetryService
      if (stepResult.status === 'failure' && stepResult.error?.retryable && this.#retryService) {
        let retryCount = 0
        const excludeAgentIds = stepResult.agentId !== 'unknown' ? [stepResult.agentId] : []

        while (retryCount < this.#maxRetry) {
          log.warn(
            { stepIndex: i, attempt: retryCount + 1, maxRetry: this.#maxRetry, errorCode: stepResult.error?.code },
            'serial step failed, retrying'
          )

          const { result: retryResult, shouldRetry } = await this.#retryService.executeWithRetry({
            fn: async (excludedIds) => {
              return await this.#executeStep(
                { ...step, input: stepInput },
                task.conversationId,
                task.taskId,
                abortController,
                timeoutMs,
                excludedIds
              )
            },
            lastResult: stepResult,
            retryCount,
            excludeAgentIds,
            logger: this.#logger
          })

          stepResult = retryResult

          if (!shouldRetry || stepResult.status === 'success') break
          retryCount++

          // 更新排除列表
          if (stepResult.agentId !== 'unknown' && !excludeAgentIds.includes(stepResult.agentId)) {
            excludeAgentIds.push(stepResult.agentId)
          }
        }

        if (stepResult.status === 'failure') {
          log.error({ stepIndex: i, retryCount, errorCode: stepResult.error?.code }, 'serial step failed after all retries')
        }
      }

      results.push(stepResult)
      current = this.#updateTask(current, { results: [...results] })

      if (stepResult.status === 'success') {
        log.info({ stepIndex: i, durationMs: stepResult.finishedAt - stepResult.startedAt }, 'serial step completed')
        this.#emitLog(task.taskId, 'executor',
          `步骤 ${i + 1}/${task.steps.length} 完成，耗时: ${((stepResult.finishedAt - stepResult.startedAt) / 1000).toFixed(1)}s`,
          { stepIndex: i, status: 'success', durationMs: stepResult.finishedAt - stepResult.startedAt }
        )
      }

      if (stepResult.status === 'failure') {
        this.#emitLog(task.taskId, 'executor',
          `步骤 ${i + 1} 失败: ${stepResult.error?.message ?? 'unknown error'}`,
          { stepIndex: i, status: 'failure', error: stepResult.error }
        )
        return this.#updateTask(current, { results, status: 'failure', finishedAt: Date.now() })
      }
    }

    log.info({ totalSteps: results.length, durationMs: Date.now() - task.startedAt }, 'serial task completed')
    this.#emitLog(task.taskId, 'executor', `串行任务全部完成，共 ${results.length} 步，总耗时: ${((Date.now() - task.startedAt) / 1000).toFixed(1)}s`)
    return this.#updateTask(current, { results, status: 'success', finishedAt: Date.now() })
  }

  /**
   * 并行执行多步任务
   *
   * 使用 Promise.allSettled，收集所有结果（无论成功/失败）。
   * 全部成功 → success，部分成功 → partial，全部失败 → failure。
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {AbortController} abortController
   * @returns {Promise<import('../models/task.js').TaskRecord>}
   */
  async #executeParallel(task, abortController) {
    const timeoutMs = this.#resolveTimeout(task)
    const log = this.#childLog({ taskId: task.taskId, strategy: 'parallel' })

    log.info({ stepCount: task.steps.length, timeoutMs }, 'parallel execution start')
    this.#emitLog(task.taskId, 'executor', `并行执行开始，共 ${task.steps.length} 步`)

    const promises = task.steps.map(step =>
      this.#executeStep(
        { ...step, input: step.input ?? task.request?.input },
        task.conversationId,
        task.taskId,
        abortController,
        timeoutMs
      )
    )

    const settled = await Promise.allSettled(promises)
    const results = settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      return createStepResult({
        stepIndex: task.steps[i]?.stepIndex ?? i,
        agentId: 'unknown',
        status: 'failure',
        error: { code: 'ERR_UNKNOWN', message: String(result.reason), retryable: true },
        startedAt: Date.now(),
        finishedAt: Date.now()
      })
    })

    const successes = results.filter(r => r.status === 'success').length
    const failures = results.filter(r => r.status === 'failure').length
    let status
    if (failures === 0) status = 'success'
    else if (successes === 0) status = 'failure'
    else status = 'partial'

    log.info({ successes, failures, status, durationMs: Date.now() - task.startedAt }, 'parallel execution completed')
    this.#emitLog(task.taskId, 'executor',
      `并行执行完成，成功: ${successes}，失败: ${failures}，状态: ${status}，耗时: ${((Date.now() - task.startedAt) / 1000).toFixed(1)}s`
    )
    return this.#updateTask(task, { results, status, finishedAt: Date.now() })
  }

  /**
   * 执行单个步骤任务
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {AbortController} abortController
   * @returns {Promise<import('../models/task.js').TaskRecord>}
   */
  async #executeSingle(task, abortController) {
    const timeoutMs = this.#resolveTimeout(task)
    const log = this.#childLog({ taskId: task.taskId, strategy: 'single' })
    const step = task.steps[0]

    log.info({ capability: step.capability }, 'single step start')
    this.#emitLog(task.taskId, 'executor', `步骤开始，能力: ${step.capability}`, { stepIndex: step.stepIndex })

    const stepResult = await this.#executeStep(
      { ...step, input: step.input ?? task.request?.input },
      task.conversationId,
      task.taskId,
      abortController,
      timeoutMs
    )

    const results = [stepResult]
    log.info(
      { status: stepResult.status, durationMs: stepResult.finishedAt - stepResult.startedAt },
      'single step completed'
    )
    this.#emitLog(task.taskId, 'executor',
      `步骤完成，状态: ${stepResult.status}，耗时: ${((stepResult.finishedAt - stepResult.startedAt) / 1000).toFixed(1)}s`,
      { stepIndex: step.stepIndex, status: stepResult.status }
    )
    return this.#updateTask(task, { results, status: stepResult.status, finishedAt: Date.now() })
  }

  /**
   * 执行步骤（重试版本，排除指定 Agent）
   *
   * 与 #executeStep 相同，但使用 scheduler.selectAgentExcluding() 排除已失败的 Agent。
   *
   * @param {Object} step
   * @param {string} conversationId
   * @param {string} taskId
   * @param {AbortController} abortController
   * @param {number} timeoutMs
   * @param {string[]} excludeAgentIds
   * @returns {Promise<import('../models/task.js').StepResult>}
   */
  async #executeStepWithRetry(step, conversationId, taskId, abortController, timeoutMs, excludeAgentIds) {
    return await this.#executeStep(step, conversationId, taskId, abortController, timeoutMs, excludeAgentIds)
  }

  /**
   * 执行一个步骤（核心方法）
   *
   * 不抛异常，错误封装为 StepResult（「错误即结果」模式）。
   *
   * 流程：
   * 1. scheduler.selectAgent(step.capability) 选择 Agent（可选排除列表）
   * 2. 构建 task_assign payload（与 message.js VALID_TYPES 一致）
   * 3. 创建 AbortController + setTimeout
   * 4. POST {agent.endpoint}/bee/task 发送任务
   * 5. 等待响应或超时
   * 6. 超时时 POST /bee/cancel 通知 Agent（best-effort）
   * 7. finally: clearTimeout
   * 8. 返回 StepResult
   *
   * @param {Object} step - { stepIndex, capability, description, input }
   * @param {string} conversationId
   * @param {string} taskId
   * @param {AbortController} abortController
   * @param {number} timeoutMs
   * @param {string[]} [excludeAgentIds] - 排除的 Agent ID 列表
   * @returns {Promise<import('../models/task.js').StepResult>}
   */
  async #executeStep(step, conversationId, taskId, abortController, timeoutMs, excludeAgentIds = []) {
    const startedAt = Date.now()
    const log = this.#childLog({ taskId, stepIndex: step.stepIndex, capability: step.capability })

    // 1. 选择 Agent（支持排除列表）
    let agent
    try {
      if (excludeAgentIds.length > 0) {
        agent = this.#scheduler.selectAgentExcluding(step.capability, excludeAgentIds)
      } else {
        agent = this.#scheduler.selectAgent(step.capability)
      }
    } catch (err) {
      log.warn({ err: err.message }, 'no agent available for capability')
      return createStepResult({
        stepIndex: step.stepIndex,
        agentId: 'unknown',
        status: 'failure',
        error: { code: 'ERR_NO_AGENT', message: err.message, retryable: true },
        startedAt,
        finishedAt: Date.now()
      })
    }

    // 外部已取消
    if (abortController.signal.aborted) {
      log.info('step skipped: task already cancelled')
      return createStepResult({
        stepIndex: step.stepIndex,
        agentId: agent.agentId,
        status: 'failure',
        error: { code: 'ERR_TASK_CANCELLED', message: 'Task was cancelled', retryable: false },
        startedAt,
        finishedAt: Date.now()
      })
    }

    // 解析步骤级超时（优先使用 agent 的 timeout_default）
    const task = this.#tasks.get(taskId)
    const effectiveTimeoutMs = this.#resolveStepTimeout(task, agent, timeoutMs)
    log.info({ timeoutMs: effectiveTimeoutMs, source: task?.request?.constraints?.timeout ? 'task' : agent.constraints?.timeout_default ? 'agent' : 'default' }, 'timeout resolved')

    // 2. 构建 task_assign payload（type 与 message.js VALID_TYPES 一致）
    const payload = {
      type: 'task_assign',
      task: {
        task_id: taskId,
        name: step.description,
        description: step.description,
        capability: step.capability,
        input: step.input,
        expected_output: null,
        constraints: { timeout: Math.ceil(effectiveTimeoutMs / 1000) }
      },
      context: {
        conversation_id: conversationId,
        parent_task_id: null,
        shared_state: {}
      }
    }

    // 3. 设置超时
    const stepAbortController = new AbortController()
    let timer
    let timedOut = false

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        stepAbortController.abort()
        reject(new Error(`Step ${step.stepIndex} timed out after ${effectiveTimeoutMs}ms`))
      }, effectiveTimeoutMs)
    })

    const onExternalAbort = () => stepAbortController.abort()
    abortController.signal.addEventListener('abort', onExternalAbort, { once: true })

    try {
      // 4. POST /bee/task
      log.info({ agentId: agent.agentId, endpoint: agent.endpoint }, 'dispatching step to agent')
      this.#emitLog(taskId, 'executor', `步骤调度 → ${agent.agentId}`, { agentId: agent.agentId, stepIndex: step.stepIndex })

      const fetchPromise = fetch(`${agent.endpoint}/bee/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: stepAbortController.signal
      })

      const response = await Promise.race([fetchPromise, timeoutPromise])
      clearTimeout(timer)

      // 5a. 成功响应
      if (response.ok) {
        const body = await response.json()
        log.info({ agentId: agent.agentId, status: body.status ?? 'success', durationMs: Date.now() - startedAt }, 'step completed')
        return createStepResult({
          stepIndex: step.stepIndex,
          agentId: agent.agentId,
          status: body.status ?? 'success',
          output: body.output,
          summary: body.summary,
          usage: body.usage,
          artifacts: body.artifacts,
          startedAt,
          finishedAt: Date.now()
        })
      }

      // 5b. 非 2xx 响应
      log.warn({ agentId: agent.agentId, statusCode: response.status }, 'agent returned error')
      let errorInfo = { code: 'ERR_UNKNOWN', message: `HTTP ${response.status}`, retryable: false }
      try {
        const errBody = await response.json()
        if (errBody.error) {
          errorInfo = {
            code: errBody.error.code ?? 'ERR_UNKNOWN',
            message: errBody.error.message ?? `HTTP ${response.status}`,
            retryable: errBody.error.retryable ?? false
          }
        }
      } catch { /* 解析失败使用默认错误 */ }

      return createStepResult({
        stepIndex: step.stepIndex,
        agentId: agent.agentId,
        status: 'failure',
        error: errorInfo,
        startedAt,
        finishedAt: Date.now()
      })
    } catch (err) {
      clearTimeout(timer)

      if (timedOut || err.name === 'AbortError') {
        log.warn({ agentId: agent.agentId, timedOut, durationMs: Date.now() - startedAt }, 'step timed out or aborted')

        // 超时时 best-effort 通知 Agent
        if (timedOut) {
          try {
            await fetch(`${agent.endpoint}/bee/cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ task_id: taskId, reason: 'timeout' }),
              signal: AbortSignal.timeout(3000)
            })
          } catch { /* 取消通知失败不影响流程 */ }
        }

        const code = abortController.signal.aborted && !timedOut
          ? 'ERR_TASK_CANCELLED'
          : 'ERR_TIMEOUT'

        return createStepResult({
          stepIndex: step.stepIndex,
          agentId: agent.agentId,
          status: 'failure',
          error: { code, message: err.message, retryable: code === 'ERR_TIMEOUT' },
          startedAt,
          finishedAt: Date.now()
        })
      }

      // 网络错误
      log.error({ agentId: agent.agentId, err: err.message }, 'step failed with network error')
      return createStepResult({
        stepIndex: step.stepIndex,
        agentId: agent.agentId,
        status: 'failure',
        error: { code: 'ERR_UNKNOWN', message: err.message ?? 'Network error', retryable: true },
        startedAt,
        finishedAt: Date.now()
      })
    } finally {
      abortController.signal.removeEventListener('abort', onExternalAbort)
    }
  }

  // ── 内部工具 ──────────────────────────────────

  /**
   * 发射 task.log 事件（通过 EventBus 推送到 SSE）
   *
   * @param {string} taskId
   * @param {string} source - 日志来源（planner / executor / agent）
   * @param {string} message - 日志消息
   * @param {Object} [extra] - 额外字段
   */
  #emitLog(taskId, source, message, extra = {}) {
    const entry = {
      taskId,
      source,
      message,
      timestamp: Date.now(),
      ...extra
    }
    // 持久化日志（刷新后可通过 API 获取）
    const logs = this.#taskLogs.get(taskId)
    if (logs) {
      logs.push(entry)
    } else {
      this.#taskLogs.set(taskId, [entry])
    }
    this.#eventBus?.emit('task.log', entry)
  }

  /**
   * 创建子 logger（兼容没有 child 方法的 logger）
   *
   * @param {Object} bindings
   * @returns {Object}
   */
  #childLog(bindings) {
    if (typeof this.#logger.child === 'function') {
      return this.#logger.child(bindings)
    }
    // fallback：直接返回原 logger（测试中传入的 console 等简单对象）
    return this.#logger
  }

  /**
   * 创建新的冻结任务对象并存入 #tasks（替换而非修改）
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {Object} patch
   * @returns {import('../models/task.js').TaskRecord}
   */
  #updateTask(task, patch) {
    const updated = Object.freeze({ ...task, ...patch })
    this.#tasks.set(task.taskId, updated)
    this.#eventBus?.emit('task.updated', updated)
    return updated
  }

  /**
   * 解析任务超时（毫秒）
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @returns {number}
   */
  #resolveTimeout(task) {
    const constraintSec = task.request?.constraints?.timeout
    return constraintSec != null ? constraintSec * 1000 : this.#defaultTimeout
  }

  /**
   * 解析步骤级超时（毫秒）
   *
   * 优先级：task.request.constraints.timeout > agent.constraints.timeout_default > taskTimeoutMs
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {import('../models/agent.js').AgentRecord} agent
   * @param {number} taskTimeoutMs - 任务级超时（来自 #resolveTimeout，可能是 defaultTimeoutMs）
   * @returns {number}
   */
  #resolveStepTimeout(task, agent, taskTimeoutMs) {
    const constraintSec = task?.request?.constraints?.timeout
    if (constraintSec != null) return constraintSec * 1000
    // 仅当任务未显式指定 timeout 时，使用 agent 的 timeout_default
    return agent.constraints?.timeout_default != null
      ? agent.constraints.timeout_default * 1000
      : taskTimeoutMs
  }
}
