/**
 * 工作会话集成测试
 *
 * 核心场景：3 个连续任务互相引用上下文
 * 1. 创建 session "竞品分析项目"
 * 2. 注册 Agent
 * 3. 提交任务 A（搜索竞品数据），完成
 * 4. 提交任务 B（数据分析），reference_conversations: [conv_A]，验证上下文被注入
 * 5. 提交任务 C（生成报告），reference_conversations: [conv_A, conv_B]
 * 6. 验证 session 包含 3 个 conversationId
 * 7. 验证 GET /session/:id 返回完整数据
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Planner } from '../../src/core/planner.js'
import { Executor } from '../../src/services/executor.js'
import { SessionService } from '../../src/services/session-service.js'
import { MemoryStore } from '../../src/storage/memory-store.js'

function makeSpec(overrides = {}) {
  return {
    identity: { role: 'worker', ...overrides.identity },
    runtime: { endpoint: overrides.endpoint ?? 'http://localhost:0', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['search'],
    model: overrides.model ?? {},
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? [],
    ...(overrides.constraints != null && { constraints: overrides.constraints })
  }
}

function mockFetch(handler) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url, options) => handler(url, options))
  return () => { globalThis.fetch = originalFetch }
}

describe('Session Flow Integration', () => {
  let hive, scheduler, executor, store, sessionService

  beforeEach(async () => {
    hive = new Hive()
    const waggle = new Waggle({ maxSize: 100 })
    scheduler = new Scheduler({ hive })
    executor = new Executor({ scheduler, defaultTimeoutMs: 5000 })
    store = new MemoryStore()
    await store.init()
    sessionService = new SessionService({ store })
  })

  afterEach(async () => {
    await store.close()
  })

  describe('3 个连续任务互相引用上下文', () => {
    it('完整流程：搜索 → 数据分析 → 生成报告', async () => {
      // 1. 创建 session "竞品分析项目"
      const session = await sessionService.createSession('竞品分析项目')
      expect(session.sessionId).toMatch(/^wsess_/)

      // 2. 注册 Agent
      hive.register(makeSpec({
        capabilities: ['search', 'data_analysis', 'code_generation', 'text_writing'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      // mock fetch：根据任务描述返回不同结果
      const callLog = []
      const restore = mockFetch((url, options) => {
        const body = JSON.parse(options.body)
        const desc = body.task?.description ?? ''
        callLog.push({ url, desc })

        if (desc.includes('搜索') || desc.includes('搜索步骤')) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              output: { competitors: ['A公司', 'B公司', 'C公司'], count: 3 },
              summary: '搜索到3家竞品数据'
            })
          }
        }
        if (desc.includes('分析') || desc.includes('数据分析')) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              output: { insight: '市场集中度较高，A公司占40%份额' },
              summary: '数据分析完成，A公司领先'
            })
          }
        }
        if (desc.includes('报告') || desc.includes('生成') || desc.includes('text_writing')) {
          return {
            ok: true,
            json: async () => ({
              status: 'success',
              output: '竞品分析报告：市场集中度较高...',
              summary: '报告生成完成'
            })
          }
        }
        return {
          ok: true,
          json: async () => ({ status: 'success', output: 'ok', summary: '完成' })
        }
      })

      try {
        // 3. 提交任务 A（搜索竞品数据）
        const planner = new Planner({ hive })

        const planA = await planner.analyzePlan('搜索竞品数据')
        const { createTaskRecord } = await import('../../src/models/task.js')
        const taskA = createTaskRecord({
          conversationId: planA.conversationId,
          strategy: planA.strategy,
          request: { description: '搜索竞品数据' },
          steps: planA.steps
        })

        const resultA = await executor.run(taskA)
        expect(resultA.status).toBe('success')

        // 添加到 session
        const keyOutputA = sessionService.extractKeyOutput(resultA)
        await sessionService.addConversation(session.sessionId, resultA.conversationId, keyOutputA)

        // 4. 验证上下文引用解析（任务 B 引用 conv_A）
        const refsA = await sessionService.resolveReferences(session.sessionId, [resultA.conversationId])
        expect(refsA.references[resultA.conversationId]).toBeDefined()
        expect(refsA.references[resultA.conversationId].summary).toBeDefined()

        // 提交任务 B（数据分析）
        const planB = await planner.analyzePlan('数据分析')
        const taskB = createTaskRecord({
          conversationId: planB.conversationId,
          strategy: planB.strategy,
          request: { description: '数据分析' },
          steps: planB.steps
        })

        const resultB = await executor.run(taskB)
        expect(resultB.status).toBe('success')

        // 添加到 session
        const keyOutputB = sessionService.extractKeyOutput(resultB)
        await sessionService.addConversation(session.sessionId, resultB.conversationId, keyOutputB)

        // 5. 提交任务 C（生成报告），引用 conv_A 和 conv_B
        const refsAB = await sessionService.resolveReferences(session.sessionId, [
          resultA.conversationId,
          resultB.conversationId
        ])
        expect(Object.keys(refsAB.references)).toHaveLength(2)
        expect(refsAB.references[resultA.conversationId]).toBeDefined()
        expect(refsAB.references[resultB.conversationId]).toBeDefined()

        const planC = await planner.analyzePlan('生成报告')
        const taskC = createTaskRecord({
          conversationId: planC.conversationId,
          strategy: planC.strategy,
          request: { description: '生成报告' },
          steps: planC.steps
        })

        const resultC = await executor.run(taskC)
        expect(resultC.status).toBe('success')

        const keyOutputC = sessionService.extractKeyOutput(resultC)
        await sessionService.addConversation(session.sessionId, resultC.conversationId, keyOutputC)

        // 6. 验证 session 包含 3 个 conversationId
        const finalSession = await sessionService.getSession(session.sessionId)
        expect(finalSession.conversationIds).toHaveLength(3)
        expect(finalSession.conversationIds).toContain(resultA.conversationId)
        expect(finalSession.conversationIds).toContain(resultB.conversationId)
        expect(finalSession.conversationIds).toContain(resultC.conversationId)

        // 7. 验证 GET /session/:id 返回完整数据
        expect(finalSession.title).toBe('竞品分析项目')
        expect(finalSession.status).toBe('active')
        expect(finalSession.keyOutputs[resultA.conversationId]).toBeDefined()
        expect(finalSession.keyOutputs[resultB.conversationId]).toBeDefined()
        expect(finalSession.keyOutputs[resultC.conversationId]).toBeDefined()
      } finally {
        restore()
      }
    })

    it('引用不存在的 conversationId 返回空引用', async () => {
      const session = await sessionService.createSession('test')

      const refs = await sessionService.resolveReferences(session.sessionId, ['conv_nonexistent'])
      expect(refs.references).toEqual({})
      expect(refs.sharedContext).toEqual({})
    })

    it('跨任务共享上下文通过 addSharedContext', async () => {
      const session = await sessionService.createSession('测试项目')

      // 第一个任务完成后添加共享上下文
      await sessionService.addSharedContext(session.sessionId, {
        domain: '电商',
        targetCompetitors: ['A', 'B']
      })

      // 第二个任务解析引用时获取共享上下文
      const refs = await sessionService.resolveReferences(session.sessionId, [])
      expect(refs.sharedContext.domain).toBe('电商')
      expect(refs.sharedContext.targetCompetitors).toEqual(['A', 'B'])
    })

    it('归档会话后仍可获取数据', async () => {
      const session = await sessionService.createSession('测试项目')
      await sessionService.addConversation(session.sessionId, 'conv_001', {
        type: 'output',
        summary: '结果'
      })

      const archived = await sessionService.archiveSession(session.sessionId)
      expect(archived.status).toBe('archived')

      // 仍然可以获取
      const found = await sessionService.getSession(session.sessionId)
      expect(found).not.toBeNull()
      expect(found.conversationIds).toContain('conv_001')
    })
  })
})
