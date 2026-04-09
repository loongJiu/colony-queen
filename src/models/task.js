/**
 * Task 数据模型
 *
 * 定义 TaskRecord 与 StepResult 类型及工厂函数，
 * 用于任务执行链路中的数据流转。
 */

import { genTaskId } from '../utils/id.js'
import { ValidationError } from '../utils/errors.js'

export const VALID_TASK_STATUSES = ['pending', 'planning', 'running', 'success', 'failure', 'partial', 'cancelled']
export const VALID_STRATEGIES = ['single', 'serial', 'parallel']

/**
 * 单步执行结果
 *
 * @typedef {Object} StepResult
 * @property {number}   stepIndex      - 步骤序号
 * @property {string}   agentId        - 执行的 Agent ID
 * @property {'success'|'failure'} status
 * @property {*}        [output]       - Agent 返回的 output
 * @property {string}   [summary]      - Agent 返回的 summary
 * @property {{ input_tokens?: number, output_tokens?: number, latency_ms?: number }} [usage]
 * @property {any[]}    [artifacts]    - Agent 返回的 artifacts
 * @property {{ code: string, message: string, retryable: boolean }} [error]
 * @property {number}   startedAt      - 步骤开始时间戳
 * @property {number}   [finishedAt]   - 步骤结束时间戳
 */

/**
 * 任务记录（不可变）
 *
 * @typedef {Object} TaskRecord
 * @property {string}   taskId          - task_{ts}_{rand4}
 * @property {string}   [parentTaskId]  - 父任务 ID（预留）
 * @property {string}   conversationId  - 会话 ID（conv_{ts}_{rand4}）
 * @property {'single'|'serial'|'parallel'} strategy
 * @property {Object}   request         - 原始请求信息
 * @property {string}   request.description
 * @property {*}        request.input
 * @property {string}   [request.expectedOutput]
 * @property {Object}   [request.constraints]
 * @property {Array<{ stepIndex: number, capability: string, description: string, input?: any }>} steps
 * @property {string}   status          - pending | running | success | failure | partial | cancelled
 * @property {StepResult[]} results     - 各步骤结果
 * @property {*}        [finalOutput]   - 聚合后的最终输出
 * @property {number}   createdAt
 * @property {number}   [startedAt]
 * @property {number}   [finishedAt]
 */

/**
 * 创建不可变的 TaskRecord
 *
 * @param {Object} params
 * @param {string} [params.conversationId] - 会话 ID
 * @param {'single'|'serial'|'parallel'} params.strategy - 执行策略
 * @param {Object} params.request - 原始请求 { description, input, expectedOutput, constraints }
 * @param {Array<{ stepIndex: number, capability: string, description: string, input?: any }>} params.steps
 * @param {string} [params.parentTaskId] - 父任务 ID
 * @returns {TaskRecord}
 * @throws {ValidationError} description 为空或 strategy 无效
 */
export function createTaskRecord(params) {
  const { conversationId, strategy, request, steps, parentTaskId, planInfo, planLogs, taskId } = params

  if (!request?.description) {
    throw new ValidationError('request.description is required')
  }

  if (!strategy || !VALID_STRATEGIES.includes(strategy)) {
    throw new ValidationError(
      `Invalid strategy "${strategy}", must be one of: ${VALID_STRATEGIES.join(', ')}`
    )
  }

  const record = {
    taskId: taskId || genTaskId(),
    ...(parentTaskId != null && { parentTaskId }),
    conversationId: conversationId ?? genTaskId(),
    strategy,
    request: {
      description: request.description,
      ...(request.input !== undefined && { input: request.input }),
      ...(request.expectedOutput != null && { expectedOutput: request.expectedOutput }),
      ...(request.constraints != null && { constraints: request.constraints })
    },
    steps: steps.map((s, i) => ({
      stepIndex: s.stepIndex ?? i,
      capability: s.capability,
      description: s.description,
      ...(s.input !== undefined && { input: s.input })
    })),
    status: 'pending',
    results: [],
    createdAt: Date.now(),
    ...(planInfo != null && { planInfo }),
    ...(planLogs != null && { planLogs })
  }

  return Object.freeze(record)
}

/**
 * 创建单步执行结果的快照（不可变）
 *
 * @param {Object} params
 * @param {number} params.stepIndex
 * @param {string} params.agentId
 * @param {'success'|'failure'} params.status
 * @param {*} [params.output]
 * @param {string} [params.summary]
 * @param {Object} [params.usage]
 * @param {any[]}  [params.artifacts]
 * @param {{ code: string, message: string, retryable: boolean }} [params.error]
 * @param {number} params.startedAt
 * @param {number} [params.finishedAt]
 * @returns {StepResult}
 */
export function createStepResult(params) {
  const result = {
    stepIndex: params.stepIndex,
    agentId: params.agentId,
    status: params.status,
    startedAt: params.startedAt,
    ...(params.output !== undefined && { output: params.output }),
    ...(params.summary != null && { summary: params.summary }),
    ...(params.usage != null && { usage: params.usage }),
    ...(params.artifacts != null && { artifacts: params.artifacts }),
    ...(params.error != null && { error: params.error }),
    ...(params.finishedAt != null && { finishedAt: params.finishedAt }),
    ...(params.retryCount != null && { retryCount: params.retryCount }),
    ...(params.retryHistory != null && { retryHistory: params.retryHistory })
  }

  return Object.freeze(result)
}
