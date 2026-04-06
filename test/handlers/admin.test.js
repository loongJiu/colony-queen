/**
 * Admin 管理接口测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { HeartbeatMonitor } from '../../src/services/heartbeat.js'
import { NotFoundError } from '../../src/utils/errors.js'
import adminRoutes from '../../src/handlers/admin.js'

describe('Admin Routes', () => {
  let app
  let hive
  let waggle
  let scheduler
  let planner
  let executor
  let heartbeat

  beforeAll(async () => {
    app = Fastify()

    hive = new Hive()
    waggle = new Waggle({ maxSize: 100 })
    scheduler = new Scheduler({ hive })
    planner = new Planner({ hive })
    executor = new Executor({ scheduler })
    heartbeat = new HeartbeatMonitor({ hive, waggle, intervalMs: 10000, timeoutMs: 30000 })

    app.decorate('hive', hive)
    app.decorate('waggle', waggle)
    app.decorate('scheduler', scheduler)
    app.decorate('planner', planner)
    app.decorate('executor', executor)

    // 注册错误处理器
    app.setErrorHandler((err, request, reply) => {
      if (err instanceof NotFoundError) {
        reply.status(404).send(err.toJSON(request.id))
        return
      }
      reply.status(500).send({ error: { code: 'ERR_INTERNAL', message: err.message } })
    })

    app.register(adminRoutes, { hive, executor, heartbeat })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /admin/agents', () => {
    it('返回空列表（无 Agent）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/agents'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('agent.list')
      expect(body.agents).toEqual([])
      expect(body.total).toBe(0)
      expect(body.byStatus).toEqual({ idle: 0, busy: 0, error: 0, offline: 0 })
    })

    it('返回已注册的 Agent 列表', async () => {
      // 注册一个测试 Agent，使用返回的 agentId
      const agent = hive.register({
        identity: { role: 'worker' },
        name: 'Test Worker',
        description: 'A test worker',
        capabilities: ['test'],
        endpoint: 'http://localhost:3000',
        constraints: {}
      }, 'session-token-1')

      const response = await app.inject({
        method: 'GET',
        url: '/admin/agents'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.total).toBe(1)
      expect(body.agents[0].agentId).toBe(agent.agentId)
      expect(body.byStatus.idle).toBe(1)
    })
  })

  describe('GET /admin/tasks', () => {
    it('返回空列表（无任务）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/tasks'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('task.list')
      expect(body.tasks).toEqual([])
      expect(body.total).toBe(0)
    })
  })

  describe('GET /admin/health', () => {
    it('返回系统健康状态', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/health'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('health.status')
      expect(body.status).toBe('healthy')
      expect(body.uptime).toBeDefined()
      expect(body.uptime.seconds).toBeGreaterThanOrEqual(0) // 允许为 0（测试运行快）
      expect(body.memory).toBeDefined()
      expect(body.memory.rss).toMatch(/^\d+MB$/)
      expect(body.stats).toBeDefined()
      expect(body.stats.registeredAgents).toBeGreaterThanOrEqual(0) // 可能有其他测试的 Agent
    })
  })

  describe('DELETE /admin/agents/:id', () => {
    it('踢出不存在的 Agent 返回 404', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/agents/non-existent'
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('ERR_NOT_FOUND')
    })

    it('成功踢出 Agent 返回 204', async () => {
      // 注册一个测试 Agent，使用返回的 agentId
      const agent = hive.register({
        identity: { role: 'worker' },
        name: 'Test Worker',
        description: 'A test worker',
        capabilities: ['test'],
        endpoint: 'http://localhost:3000',
        constraints: {}
      }, 'session-token-delete')

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/agents/${agent.agentId}`
      })

      expect(response.statusCode).toBe(204)
      expect(response.body).toBe('')

      // 验证 Agent 已被删除
      expect(hive.get(agent.agentId)).toBeUndefined()
    })
  })
})
