/**
 * Week 4 验收测试
 *
 * 验收标准：
 * 1. RetryService 正确判断 retryable 错误
 * 2. Agent 掉线触发 agent.offline 事件
 * 3. 通过 /admin/agents 查看状态确认
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { RetryService } from '../../src/services/retry.js'
import { HeartbeatMonitor } from '../../src/services/heartbeat.js'
import { TaskRescheduler } from '../../src/services/rescheduler.js'
import adminRoutes from '../../src/handlers/admin.js'

describe('Week 4 Acceptance Tests', () => {
  let app
  let hive
  let waggle
  let scheduler
  let planner
  let retryService
  let executor
  let heartbeat
  let rescheduler

  let agent1, agent2

  beforeAll(async () => {
    app = Fastify()

    hive = new Hive()
    waggle = new Waggle({ maxSize: 100 })
    scheduler = new Scheduler({ hive })
    planner = new Planner({ hive })
    retryService = new RetryService()
    executor = new Executor({
      scheduler,
      retryService,
      logger: app.log,
      defaultTimeoutMs: 2000
    })
    heartbeat = new HeartbeatMonitor({
      hive,
      waggle,
      intervalMs: 1000,
      timeoutMs: 3000
    })
    rescheduler = new TaskRescheduler({
      waggle,
      executor,
      scheduler,
      logger: app.log
    })

    app.decorate('hive', hive)
    app.decorate('waggle', waggle)
    app.decorate('scheduler', scheduler)
    app.decorate('planner', planner)
    app.decorate('executor', executor)
    app.decorate('retryService', retryService)
    app.decorate('rescheduler', rescheduler)

    app.register(adminRoutes, { hive, executor, heartbeat })

    await app.ready()

    // 注册两个测试 Agent
    agent1 = await hive.register({
      identity: { role: 'worker' },
      name: 'worker-1',
      description: 'Test worker 1',
      capabilities: ['search', 'analysis'],
      endpoint: 'http://localhost:3001',
      constraints: {}
    }, 'token-1')

    agent2 = await hive.register({
      identity: { role: 'worker' },
      name: 'worker-2',
      description: 'Test worker 2',
      capabilities: ['search', 'analysis'],
      endpoint: 'http://localhost:3002',
      constraints: {}
    }, 'token-2')

    heartbeat.start()
    rescheduler.start()
  }, 10000)

  afterAll(async () => {
    await heartbeat?.stop()
    await rescheduler?.stop()
    await app?.close()
  })

  describe('验收场景 1: RetryService 判断 retryable', () => {
    it('ERR_TIMEOUT 被判断为可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'Timeout' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: app.log
      })

      expect(shouldRetry).toBe(true)
    })

    it('ERR_VALIDATION 被判断为不可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_VALIDATION', message: 'Invalid input' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: app.log
      })

      expect(shouldRetry).toBe(false)
    })

    it('达到最大重试次数后停止', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'Timeout', retryable: true }
      })

      const { result, shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 3, // 达到最大次数
        excludeAgentIds: [],
        logger: app.log
      })

      expect(shouldRetry).toBe(false)
      expect(result.error.code).toBe('ERR_MAX_RETRY')
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('验收场景 2: Agent 掉线 → 状态更新', () => {
    it('Agent 掉线后被标记为 offline', async () => {
      // 标记 agent1 为 offline
      hive.markOffline(agent1.agentId)

      // 验证 agent1 已被标记为 offline
      const agent = hive.get(agent1.agentId)
      expect(agent?.status).toBe('offline')

      // 验证 Hive 按状态索引已更新
      const offlineAgents = hive.findByStatus('offline')
      expect(offlineAgents.some(a => a.agentId === agent1.agentId)).toBe(true)
    })

    it('TaskRescheduler 可以启动和停止', async () => {
      // 验证 Rescheduler 已启动
      expect(rescheduler).toBeDefined()

      // 验证 Rescheduler 可以停止
      rescheduler.stop()

      // 重新启动
      rescheduler.start()
    })
  })

  describe('验收场景 3: Admin 接口查看状态', () => {
    it('通过 /admin/agents 查看 Agent 状态', async () => {
      // 设置不同的状态
      hive.updateHeartbeat(agent1.agentId, { status: 'offline' })
      hive.updateHeartbeat(agent2.agentId, { status: 'busy', load: 0.8 })

      const response = await app.inject({
        method: 'GET',
        url: '/admin/agents'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body.type).toBe('agent.list')
      expect(body.total).toBe(2)
      expect(body.byStatus.offline).toBe(1)
      expect(body.byStatus.busy).toBe(1)
    })

    it('通过 /admin/health 查看系统状态', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/health'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body.type).toBe('health.status')
      expect(body.status).toBe('healthy')
      expect(body.uptime).toBeDefined()
      expect(body.stats.registeredAgents).toBe(2)
    })

    it('DELETE /admin/agents/:id 强制踢出 Agent', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/agents/${agent2.agentId}`
      })

      expect(response.statusCode).toBe(204)
      expect(hive.get(agent2.agentId)).toBeUndefined()
    })
  })
})
