/**
 * 工作会话 HTTP API 测试
 *
 * POST   /session                    — 创建工作会话
 * GET    /session                    — 列出工作会话
 * GET    /session/:sessionId         — 获取会话详情
 * POST   /session/:sessionId/context — 添加共享上下文
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { SessionService } from '../../src/services/session-service.js'
import sessionRoutes from '../../src/handlers/session.js'
import { NotFoundError, ValidationError } from '../../src/utils/errors.js'

describe('Session Routes', () => {
  let app
  let store
  let sessionService

  beforeAll(async () => {
    app = Fastify()

    store = new MemoryStore()
    await store.init()
    sessionService = new SessionService({ store })

    app.setErrorHandler((err, request, reply) => {
      if (err instanceof NotFoundError) {
        return reply.status(404).send(err.toJSON(request.id))
      }
      if (err instanceof ValidationError) {
        return reply.status(400).send(err.toJSON(request.id))
      }
      // Fastify body 解析错误（无效 JSON / 非对象类型）
      if (err.statusCode === 400 || err.statusCode === 415) {
        return reply.status(400).send({ error: { code: 'ERR_VALIDATION', message: err.message } })
      }
      reply.status(500).send({ error: { code: 'ERR_INTERNAL', message: err.message } })
    })

    app.register(sessionRoutes, { sessionService })

    await app.ready()
  })

  afterAll(async () => {
    await store.close()
    await app.close()
  })

  // ── POST /session ─────────────────────────────

  describe('POST /session', () => {
    it('creates a session with title', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: '竞品分析项目' }
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('session.created')
      expect(body.title).toBe('竞品分析项目')
      expect(body.sessionId).toMatch(/^wsess_/)
      expect(body.status).toBe('active')
    })

    it('creates a session with shared_context', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'test', shared_context: { project: 'alpha' } }
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.sharedContext).toEqual({ project: 'alpha' })
    })

    it('returns 400 when title is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/session',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('ERR_VALIDATION')
    })
  })

  // ── GET /session ──────────────────────────────

  describe('GET /session', () => {
    it('returns list of sessions', async () => {
      // 先创建几个
      await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'list-test-1' }
      })
      await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'list-test-2' }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/session'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('session.list')
      expect(body.sessions.length).toBeGreaterThanOrEqual(2)
      expect(body.total).toBe(body.sessions.length)
    })

    it('supports status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/session?status=active'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      body.sessions.forEach(s => expect(s.status).toBe('active'))
    })
  })

  // ── GET /session/:sessionId ───────────────────

  describe('GET /session/:sessionId', () => {
    it('returns session details', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'detail-test' }
      })
      const { sessionId } = JSON.parse(createRes.body)

      const response = await app.inject({
        method: 'GET',
        url: `/session/${sessionId}`
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('session.detail')
      expect(body.sessionId).toBe(sessionId)
      expect(body.title).toBe('detail-test')
    })

    it('returns 404 for non-existent session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/session/wsess_nonexistent'
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('ERR_NOT_FOUND')
    })
  })

  // ── POST /session/:sessionId/context ─────────

  describe('POST /session/:sessionId/context', () => {
    it('adds shared context to session', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'context-test' }
      })
      const { sessionId } = JSON.parse(createRes.body)

      const response = await app.inject({
        method: 'POST',
        url: `/session/${sessionId}/context`,
        payload: { goal: '竞品分析', version: 1 }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('session.context_updated')
      expect(body.sharedContext.goal).toBe('竞品分析')
      expect(body.sharedContext.version).toBe(1)
    })

    it('returns 400 for non-object body', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'context-validation' }
      })
      const { sessionId } = JSON.parse(createRes.body)

      const response = await app.inject({
        method: 'POST',
        url: `/session/${sessionId}/context`,
        payload: '"not-an-object"'
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for array body', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/session',
        payload: { title: 'context-array' }
      })
      const { sessionId } = JSON.parse(createRes.body)

      const response = await app.inject({
        method: 'POST',
        url: `/session/${sessionId}/context`,
        payload: [1, 2, 3]
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 for non-existent session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/session/wsess_nonexistent/context',
        payload: { key: 'value' }
      })

      expect(response.statusCode).toBe(404)
    })
  })
})

describe('Session Routes without sessionService', () => {
  let app

  beforeAll(async () => {
    app = Fastify()

    app.register(sessionRoutes, {})

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /session returns 503 when sessionService is not available', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/session',
      payload: { title: 'test' }
    })

    expect(response.statusCode).toBe(503)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('ERR_SESSION_SERVICE_UNAVAILABLE')
  })

  it('GET /session returns 503 when sessionService is not available', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/session'
    })

    expect(response.statusCode).toBe(503)
  })

  it('GET /session/:id returns 503 when sessionService is not available', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/session/wsess_test'
    })

    expect(response.statusCode).toBe(503)
  })

  it('POST /session/:id/context returns 503 when sessionService is not available', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/session/wsess_test/context',
      payload: { key: 'value' }
    })

    expect(response.statusCode).toBe(503)
  })
})
