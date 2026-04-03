/**
 * ID 生成工具
 *
 * 格式：{prefix}_{timestamp}_{random}
 * 例如：task_1712000000000_a3f8
 */

/**
 * 生成带前缀的唯一 ID
 * @param {string} prefix - ID 前缀，如 'task', 'agent'
 * @returns {string}
 */
export function genId(prefix) {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${ts}_${rand}`
}

/** 生成任务 ID */
export function genTaskId() {
  return genId('task')
}

/** 生成 Agent ID */
export function genAgentId() {
  return genId('agent')
}

/** 生成请求 ID */
export function genRequestId() {
  return genId('req')
}

/** 生成会话 ID */
export function genSessionId() {
  return genId('sess')
}

/** 生成消息 ID */
export function genMessageId() {
  return genId('msg')
}
