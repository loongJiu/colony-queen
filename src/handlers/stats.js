/**
 * 统计与画像管理路由
 *
 * GET /admin/stats              — 系统统计（总任务数、成功率、平均得分、活跃会话数、在线 Agent 数）
 * GET /admin/profiles           — 所有 Agent 能力画像列表（支持 ?agentId=xxx 过滤）
 * GET /admin/profiles/:agentId  — 单个 Agent 的能力画像详情
 */

/**
 * 注册统计与画像管理路由到 Fastify 实例
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   hive: import('../core/hive.js').Hive,
 *   executor: import('../services/executor.js').Executor,
 *   store?: Object,
 *   sessionService?: import('../services/session-service.js').SessionService
 * }} options
 */
export default function statsRoutes(app, options) {
  const { hive, executor, store, sessionService } = options

  // ── GET /admin/stats ──────────────────────────

  app.get('/admin/stats', async (request, reply) => {
    // 默认值（降级：无 store 时返回基本信息）
    const stats = {
      type: 'stats',
      totalTasks: 0,
      successRate: 0,
      avgScore: 0,
      activeSessions: 0,
      onlineAgents: hive.getActiveCount()
    }

    if (store) {
      try {
        // 从 feedbacks 聚合统计数据
        const feedbacks = await store.getAllFeedbacks({ limit: 10000 })
        const totalFeedbacks = feedbacks.length

        if (totalFeedbacks > 0) {
          stats.totalTasks = totalFeedbacks

          // 成功率：finalScore >= 0.6 视为成功
          const successCount = feedbacks.filter(f => (f.finalScore ?? 0) >= 0.6).length
          stats.successRate = Math.round((successCount / totalFeedbacks) * 100) / 100

          // 平均得分
          const scoresWithFinal = feedbacks.filter(f => f.finalScore != null)
          if (scoresWithFinal.length > 0) {
            const sum = scoresWithFinal.reduce((acc, f) => acc + f.finalScore, 0)
            stats.avgScore = Math.round((sum / scoresWithFinal.length) * 100) / 100
          }
        }
      } catch (err) {
        request.log.warn({ err: err.message }, 'failed to aggregate stats from feedbacks')
      }

      // 活跃会话数
      try {
        stats.activeSessions = await store.getSessionCount('active')
      } catch (err) {
        request.log.warn({ err: err.message }, 'failed to count active sessions')
      }
    }

    reply.status(200).send(stats)
  })

  // ── GET /admin/profiles ───────────────────────

  app.get('/admin/profiles', async (request, reply) => {
    if (!store) {
      return reply.status(503).send({
        error: {
          code: 'ERR_STORAGE_UNAVAILABLE',
          message: '存储服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const { agentId } = request.query ?? {}

    try {
      const profiles = await store.getAllProfiles({
        ...(agentId && { agentId })
      })

      reply.status(200).send({
        type: 'profile.list',
        profiles,
        total: profiles.length
      })
    } catch (err) {
      request.log.error({ err: err.message }, 'failed to list profiles')
      reply.status(500).send({
        error: {
          code: 'ERR_INTERNAL',
          message: '获取画像列表失败',
          requestId: request.id,
          retryable: false
        }
      })
    }
  })

  // ── GET /admin/profiles/:agentId ──────────────

  app.get('/admin/profiles/:agentId', async (request, reply) => {
    if (!store) {
      return reply.status(503).send({
        error: {
          code: 'ERR_STORAGE_UNAVAILABLE',
          message: '存储服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const { agentId } = request.params

    try {
      const capabilities = await store.getProfilesByAgentId(agentId)

      if (capabilities.length === 0) {
        return reply.status(404).send({
          error: {
            code: 'ERR_NOT_FOUND',
            message: `Agent "${agentId}" 没有能力画像数据`,
            requestId: request.id,
            retryable: false
          }
        })
      }

      // 计算综合得分（各能力 actualScore 的加权平均）
      const totalTaskCount = capabilities.reduce((sum, c) => sum + c.taskCount, 0)
      const weightedScore = totalTaskCount > 0
        ? capabilities.reduce((sum, c) => sum + c.actualScore * c.taskCount, 0) / totalTaskCount
        : capabilities.reduce((sum, c) => sum + c.actualScore, 0) / capabilities.length

      reply.status(200).send({
        type: 'profile.detail',
        agentId,
        capabilities,
        summary: {
          totalCapabilities: capabilities.length,
          overallScore: Math.round(weightedScore * 100) / 100,
          totalTaskCount
        }
      })
    } catch (err) {
      request.log.error({ err: err.message, agentId }, 'failed to get agent profile')
      reply.status(500).send({
        error: {
          code: 'ERR_INTERNAL',
          message: '获取 Agent 画像失败',
          requestId: request.id,
          retryable: false
        }
      })
    }
  })
}
