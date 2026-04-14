/**
 * Agent 数据模型
 *
 * 定义 AgentRecord 类型及工厂函数，
 * 将 bee.yaml spec 转为标准化的不可变记录。
 */

import { genAgentId } from '../utils/id.js'
import { ValidationError } from '../utils/errors.js'

const VALID_ROLES = ['queen', 'worker', 'scout']
const VALID_STATUSES = ['idle', 'busy', 'error', 'offline']

/**
 * Agent 注册记录
 *
 * @typedef {Object} AgentRecord
 * @property {string}   agentId         - 唯一 ID（Queen 生成）
 * @property {string}   role            - queen | worker | scout
 * @property {string}   name            - 可读名称
 * @property {string}   description     - 能力描述
 * @property {string[]} tags            - 自定义标签
 * @property {string}   endpoint        - HTTP 端点
 * @property {string[]} capabilities    - 能力列表
 * @property {Object}   model           - 模型配置
 * @property {string[]} toolIds         - 工具 ID 列表
 * @property {string[]} skillIds        - Skill ID 列表
 * @property {Object}   constraints     - 执行约束
 * @property {string}   status          - idle | busy | error | offline
 * @property {number}   load            - 当前负载 0.0-1.0
 * @property {number}   activeTasks     - 当前执行中的任务数
 * @property {number}   queueDepth      - 待处理任务数
 * @property {string}   sessionToken    - 会话令牌
 * @property {string}   [specVersion]   - BeeSpec 版本
 * @property {number}   joinedAt        - 加入时间戳
 * @property {number}   lastHeartbeat   - 最后心跳时间戳
 */

/**
 * 从 bee.yaml spec 创建不可变的 AgentRecord
 *
 * @param {Object} spec - 解析后的 bee.yaml 内容
 * @param {string} sessionToken - 会话令牌
 * @returns {AgentRecord}
 * @throws {ValidationError} spec.identity 缺失或 role 无效
 */
export function createAgentRecord(spec, sessionToken) {
  const identity = spec.identity
  if (!identity || !identity.role) {
    throw new ValidationError('spec.identity with role is required')
  }

  if (!VALID_ROLES.includes(identity.role)) {
    throw new ValidationError(
      `Invalid role "${identity.role}", must be one of: ${VALID_ROLES.join(', ')}`
    )
  }

  const now = Date.now()
  const constraints = spec.constraints ?? {}

  const record = {
    agentId: genAgentId(),
    role: identity.role,
    name: identity.name ?? '',
    description: identity.description ?? '',
    tags: identity.tags ?? [],
    endpoint: spec.runtime?.endpoint ?? '',
    capabilities: spec.capabilities ?? [],
    model: spec.model ?? {},
    toolIds: (spec.tools ?? []).map(t => t.id),
    skillIds: (spec.skills ?? []).map(s => s.id),
    constraints: {
      max_concurrent: constraints.max_concurrent ?? 1,
      timeout_default: constraints.timeout_default ?? 30,
      queue_max: constraints.queue_max ?? 100,
      retry_max: constraints.retry_max ?? 3
    },
    status: 'idle',
    load: 0,
    activeTasks: 0,
    queueDepth: 0,
    sessionToken,
    ...(spec.specVersion != null && { specVersion: spec.specVersion }),
    joinedAt: now,
    lastHeartbeat: now
  }

  return Object.freeze(record)
}

export { VALID_ROLES, VALID_STATUSES }
