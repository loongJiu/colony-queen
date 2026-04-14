/**
 * 工作会话路由
 *
 * POST   /session                    — 创建工作会话
 * GET    /session                    — 列出工作会话
 * GET    /session/:sessionId         — 获取会话详情
 * POST   /session/:sessionId/context — 添加共享上下文
 */

import { ValidationError, NotFoundError } from '../utils/errors.js'

/**
 * 注册工作会话路由到 Fastify 实例
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   sessionService?: import('../services/session-service.js').SessionService
 * }} options
 */
export default function sessionRoutes(app, options) {
  const { sessionService } = options

  // ── POST /session ─────────────────────────────

  app.post('/session', async (request, reply) => {
    if (!sessionService) {
      return reply.status(503).send({
        error: {
          code: 'ERR_SESSION_SERVICE_UNAVAILABLE',
          message: '会话服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const { title, shared_context: sharedContext } = request.body ?? {}

    if (!title) {
      throw new ValidationError('Missing required field: title')
    }

    const session = await sessionService.createSession(title, sharedContext)

    reply.status(201).send({
      type: 'session.created',
      ...session
    })
  })

  // ── GET /session ──────────────────────────────

  app.get('/session', async (request, reply) => {
    if (!sessionService) {
      return reply.status(503).send({
        error: {
          code: 'ERR_SESSION_SERVICE_UNAVAILABLE',
          message: '会话服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const { limit, offset, status } = request.query ?? {}
    const sessions = await sessionService.listSessions({
      ...(limit != null && { limit: Number(limit) }),
      ...(offset != null && { offset: Number(offset) }),
      ...(status && { status })
    })

    reply.status(200).send({
      type: 'session.list',
      sessions,
      total: sessions.length
    })
  })

  // ── GET /session/:sessionId ───────────────────

  app.get('/session/:sessionId', async (request, reply) => {
    if (!sessionService) {
      return reply.status(503).send({
        error: {
          code: 'ERR_SESSION_SERVICE_UNAVAILABLE',
          message: '会话服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const { sessionId } = request.params
    const session = await sessionService.getSession(sessionId)

    if (!session) {
      throw new NotFoundError(`Session "${sessionId}" not found`)
    }

    reply.status(200).send({
      type: 'session.detail',
      ...session
    })
  })

  // ── POST /session/:sessionId/context ─────────

  app.post('/session/:sessionId/context', async (request, reply) => {
    if (!sessionService) {
      return reply.status(503).send({
        error: {
          code: 'ERR_SESSION_SERVICE_UNAVAILABLE',
          message: '会话服务不可用',
          requestId: request.id,
          retryable: true
        }
      })
    }

    const { sessionId } = request.params
    const context = request.body

    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new ValidationError('Request body must be a JSON object')
    }

    const session = await sessionService.addSharedContext(sessionId, context)

    if (!session) {
      throw new NotFoundError(`Session "${sessionId}" not found`)
    }

    reply.status(200).send({
      type: 'session.context_updated',
      ...session
    })
  })
}
