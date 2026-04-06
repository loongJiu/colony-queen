/**
 * Admin 管理接口
 *
 * 提供运维视角的系统状态查看和干预能力。
 * 所有端点需要管理员权限（MVP 阶段暂不实现鉴权）。
 */

import { NotFoundError } from '../utils/errors.js'

/**
 * 注册管理路由
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {Object} options
 * @param {import('../core/hive.js').Hive} options.hive
 * @param {import('../services/executor.js').Executor} options.executor
 * @param {import('../services/heartbeat.js').HeartbeatMonitor} options.heartbeat
 */
export default function adminRoutes(app, { hive, executor, heartbeat }) {

  /**
   * GET /admin/agents
   * 列出所有 Agent
   */
  app.get('/admin/agents', async (req, reply) => {
    const agents = hive.listAll()

    // 按状态分组统计
    const byStatus = {
      idle: 0,
      busy: 0,
      error: 0,
      offline: 0
    }
    for (const agent of agents) {
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1
    }

    return {
      type: 'agent.list',
      agents,
      total: agents.length,
      byStatus
    }
  })

  /**
   * GET /admin/tasks
   * 列出所有任务
   */
  app.get('/admin/tasks', async (req, reply) => {
    const tasks = executor.listTasks()

    // 按状态分组统计
    const byStatus = {
      pending: 0,
      running: 0,
      success: 0,
      failure: 0,
      partial: 0,
      cancelled: 0
    }
    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1
    }

    return {
      type: 'task.list',
      tasks,
      total: tasks.length,
      byStatus
    }
  })

  /**
   * GET /admin/health
   * Queen 健康检查
   */
  app.get('/admin/health', async (req, reply) => {
    const uptime = process.uptime()
    const memory = process.memoryUsage()

    return {
      type: 'health.status',
      status: 'healthy',
      uptime: {
        seconds: Math.floor(uptime),
        human: formatUptime(uptime)
      },
      memory: {
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`
      },
      stats: {
        registeredAgents: hive.size,
        activeTasks: executor.listTasks().filter(t => t.status === 'running').length
      }
    }
  })

  /**
   * DELETE /admin/agents/:id
   * 强制踢出 Agent
   */
  app.delete('/admin/agents/:id', async (req, reply) => {
    const { id } = req.params

    if (!hive.has(id)) {
      throw new NotFoundError(`Agent "${id}" not found`)
    }

    // 注销 Agent
    hive.unregister(id)

    // 通知 Waggle（best-effort）
    try {
      app.waggle?.broadcast({
        type: 'event.broadcast',
        event_name: 'agent.force_removed',
        data: { agentId: id, reason: 'admin_delete' }
      })
    } catch { /* 忽略广播失败 */ }

    reply.code(204)
    return
  })
}

/**
 * 格式化运行时间为人类可读格式
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}
