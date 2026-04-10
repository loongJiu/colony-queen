/**
 * SSE 流式推送端点
 *
 * 为前端 Web 界面提供实时数据流。
 * 连接时立即推送 snapshot，之后通过 EventBus 接收增量更新。
 *
 * 事件类型：
 * - snapshot: 初始全量数据
 * - agent.updated: Agent 状态变更
 * - task.updated: 任务状态变更
 */

/**
 * 注册 SSE 路由
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {Object} options
 * @param {import('../core/hive.js').Hive} options.hive
 * @param {import('../services/executor.js').Executor} options.executor
 * @param {import('../utils/event-bus.js').EventBus} options.eventBus
 */
export default function streamRoutes (app, { hive, executor, eventBus }) {
  app.get('/admin/stream', async (req, reply) => {
    const log = req.log.child({ component: 'sse', clientIp: req.ip })

    // 设置 SSE 响应头
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no') // 关闭 Nginx 缓冲
    reply.raw.flushHeaders()

    log.info('SSE client connected')

    // 写入 SSE 事件的工具函数
    const send = (event, data) => {
      if (reply.raw.destroyed) return
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      } catch { /* 连接可能已关闭 */ }
    }

    // 1. 立即推送当前快照
    const agents = hive.listAll()
    const tasks = executor.listTasks()

    const agentStats = { idle: 0, busy: 0, error: 0, offline: 0 }
    for (const agent of agents) {
      agentStats[agent.status] = (agentStats[agent.status] || 0) + 1
    }

    const taskStats = { pending: 0, running: 0, success: 0, failure: 0, partial: 0, cancelled: 0 }
    for (const task of tasks) {
      taskStats[task.status] = (taskStats[task.status] || 0) + 1
    }

    send('snapshot', {
      agents,
      tasks,
      agentStats,
      taskStats,
      timestamp: Date.now()
    })

    // 2. 订阅 EventBus 的通配事件
    const onEvent = (envelope) => {
      send(envelope.type, envelope.data)
    }
    eventBus.on('event', onEvent)

    // 3. Keep-alive 心跳（每 25 秒）
    const keepAlive = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(': keep-alive\n\n')
      }
    }, 25000)

    // 4. 客户端断开时清理
    req.raw.on('close', () => {
      eventBus.off('event', onEvent)
      clearInterval(keepAlive)
      log.info('SSE client disconnected')
    })

    // 永不 resolve，保持 SSE 连接（客户端断开时 resolve 结束处理）
    await new Promise((resolve) => {
      req.raw.on('close', resolve)
    })
  })
}
