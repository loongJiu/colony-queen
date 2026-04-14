/**
 * 统计与画像管理 API 测试
 *
 * GET /admin/stats              — 系统统计
 * GET /admin/profiles           — 所有 Agent 能力画像列表
 * GET /admin/profiles/:agentId  — 单个 Agent 能力画像详情
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { createFeedbackRecord } from '../../src/models/feedback.js'
import { createCapabilityProfile } from '../../src/models/capability-profile.js'
import { createWorkSessionRecord } from '../../src/models/work-session.js'
import statsRoutes from '../../src/handlers/stats.js'

/**
 * 创建测试用的 profile
 */
function makeProfile(overrides = {}) {
  return createCapabilityProfile({
    agentId: 'agent_001',
    capability: 'search',
    actualScore: 0.8,
    taskCount: 10,
    successRate: 0.9,
    specializations: { web: 5, api: 3 },
    ...overrides
  })
}

describe('Stats Routes', () => {
  let app
  let hive
  let executor
  let store

  beforeAll(async () => {
    app = Fastify()

    hive = new Hive()
    const scheduler = new Scheduler({ hive })
    const planner = new Planner({ hive })
    executor = new Executor({ scheduler })
    store = new MemoryStore()
    await store.init()

    app.register(statsRoutes, { hive, executor, store })

    await app.ready()
  })

  afterAll(async () => {
    await store.close()
    await app.close()
  })

  // ── GET /admin/stats ──────────────────────────

  describe('GET /admin/stats', () => {
    it('returns default stats when no data', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/stats'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('stats')
      expect(body.totalTasks).toBe(0)
      expect(body.successRate).toBe(0)
      expect(body.avgScore).toBe(0)
      expect(body.activeSessions).toBe(0)
      expect(typeof body.onlineAgents).toBe('number')

      await freshStore.close()
      await freshApp.close()
    })

    it('calculates stats from feedbacks', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      // 插入一些反馈
      await freshStore.insertFeedback(createFeedbackRecord({
        taskId: 'task_001',
        conversationId: 'conv_001',
        agentId: 'agent_001',
        capability: 'search',
        source: 'auto',
        autoScore: 0.8,
        finalScore: 0.8
      }))

      await freshStore.insertFeedback(createFeedbackRecord({
        taskId: 'task_002',
        conversationId: 'conv_002',
        agentId: 'agent_001',
        capability: 'search',
        source: 'auto',
        autoScore: 0.4,
        finalScore: 0.4
      }))

      // 插入活跃会话
      await freshStore.insertSession(createWorkSessionRecord({ title: 'active session' }))

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/stats'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('stats')
      expect(body.totalTasks).toBe(2)
      // successRate: 0.8 >= 0.6 -> success, 0.4 < 0.6 -> fail => 1/2 = 0.5
      expect(body.successRate).toBe(0.5)
      // avgScore: (0.8 + 0.4) / 2 = 0.6
      expect(body.avgScore).toBe(0.6)
      expect(body.activeSessions).toBe(1)

      await freshStore.close()
      await freshApp.close()
    })

    it('returns onlineAgents from hive', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/stats'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(typeof body.onlineAgents).toBe('number')
    })
  })

  // ── GET /admin/profiles ───────────────────────

  describe('GET /admin/profiles', () => {
    it('returns 503 when store is not available', async () => {
      const noStoreApp = Fastify()
      noStoreApp.register(statsRoutes, { hive, executor, store: null })
      await noStoreApp.ready()

      const response = await noStoreApp.inject({
        method: 'GET',
        url: '/admin/profiles'
      })

      expect(response.statusCode).toBe(503)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('ERR_STORAGE_UNAVAILABLE')

      await noStoreApp.close()
    })

    it('returns empty list when no profiles', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/profiles'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('profile.list')
      expect(body.profiles).toEqual([])
      expect(body.total).toBe(0)

      await freshStore.close()
      await freshApp.close()
    })

    it('returns all profiles sorted by actualScore DESC', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      await freshStore.upsertProfile(makeProfile({ agentId: 'a1', capability: 'search', actualScore: 0.5 }))
      await freshStore.upsertProfile(makeProfile({ agentId: 'a2', capability: 'search', actualScore: 0.9 }))
      await freshStore.upsertProfile(makeProfile({ agentId: 'a3', capability: 'search', actualScore: 0.7 }))

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/profiles'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('profile.list')
      expect(body.total).toBe(3)
      expect(body.profiles[0].agentId).toBe('a2')
      expect(body.profiles[1].agentId).toBe('a3')
      expect(body.profiles[2].agentId).toBe('a1')

      await freshStore.close()
      await freshApp.close()
    })

    it('filters profiles by agentId query param', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      await freshStore.upsertProfile(makeProfile({ agentId: 'a1', capability: 'search' }))
      await freshStore.upsertProfile(makeProfile({ agentId: 'a2', capability: 'search' }))
      await freshStore.upsertProfile(makeProfile({ agentId: 'a1', capability: 'translate' }))

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/profiles?agentId=a1'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.total).toBe(2)
      body.profiles.forEach(p => expect(p.agentId).toBe('a1'))

      await freshStore.close()
      await freshApp.close()
    })
  })

  // ── GET /admin/profiles/:agentId ──────────────

  describe('GET /admin/profiles/:agentId', () => {
    it('returns 503 when store is not available', async () => {
      const noStoreApp = Fastify()
      noStoreApp.register(statsRoutes, { hive, executor, store: null })
      await noStoreApp.ready()

      const response = await noStoreApp.inject({
        method: 'GET',
        url: '/admin/profiles/agent_001'
      })

      expect(response.statusCode).toBe(503)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('ERR_STORAGE_UNAVAILABLE')

      await noStoreApp.close()
    })

    it('returns 404 when agent has no profiles', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/profiles/agent_nonexistent'
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe('ERR_NOT_FOUND')

      await freshStore.close()
      await freshApp.close()
    })

    it('returns agent profile detail with summary', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      await freshStore.upsertProfile(makeProfile({
        agentId: 'a1',
        capability: 'search',
        actualScore: 0.8,
        taskCount: 10
      }))
      await freshStore.upsertProfile(makeProfile({
        agentId: 'a1',
        capability: 'translate',
        actualScore: 0.6,
        taskCount: 5
      }))

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/profiles/a1'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.type).toBe('profile.detail')
      expect(body.agentId).toBe('a1')
      expect(body.capabilities).toHaveLength(2)
      expect(body.summary.totalCapabilities).toBe(2)
      expect(body.summary.totalTaskCount).toBe(15)
      // 加权平均: (0.8*10 + 0.6*5) / 15 = 11/15 ≈ 0.73
      expect(body.summary.overallScore).toBeCloseTo(0.73, 1)

      await freshStore.close()
      await freshApp.close()
    })

    it('calculates unweighted score when taskCount is 0', async () => {
      const freshStore = new MemoryStore()
      await freshStore.init()

      await freshStore.upsertProfile(makeProfile({
        agentId: 'a1',
        capability: 'search',
        actualScore: 0.6,
        taskCount: 0
      }))
      await freshStore.upsertProfile(makeProfile({
        agentId: 'a1',
        capability: 'translate',
        actualScore: 0.8,
        taskCount: 0
      }))

      const freshApp = Fastify()
      freshApp.register(statsRoutes, { hive, executor, store: freshStore })
      await freshApp.ready()

      const response = await freshApp.inject({
        method: 'GET',
        url: '/admin/profiles/a1'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      // 无加权时简单平均: (0.6 + 0.8) / 2 = 0.7
      expect(body.summary.overallScore).toBe(0.7)

      await freshStore.close()
      await freshApp.close()
    })
  })
})
