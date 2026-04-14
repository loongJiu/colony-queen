/**
 * 反馈流程集成测试
 *
 * 测试完整链路：任务完成 → 自动评分 → 用户评分 → 综合评分 → 持久化 → 回传
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { Executor } from '../../src/services/executor.js'
import { FeedbackService } from '../../src/services/feedback-service.js'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { EventBus } from '../../src/utils/event-bus.js'
import { createTaskRecord } from '../../src/models/task.js'

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

describe('Feedback Flow Integration', () => {
  let hive, scheduler, executor, store, feedbackService, eventBus

  beforeEach(async () => {
    hive = new Hive()
    const waggle = new Waggle({ maxSize: 100 })
    scheduler = new Scheduler({ hive })
    executor = new Executor({ scheduler, defaultTimeoutMs: 5000 })
    store = new MemoryStore()
    await store.init()
    eventBus = new EventBus()
    feedbackService = new FeedbackService({ eventBus, store, hive, waggle })
  })

  afterEach(async () => {
    await store.close()
  })

  describe('任务完成后自动评分', () => {
    it('executes task and generates auto feedback', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({
          status: 'success',
          output: { results: ['item1'] },
          summary: '搜索完成'
        })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索', input: { q: 'test' } },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索步骤' }]
        })

        const result = await executor.run(task)

        // 任务成功完成
        expect(result.status).toBe('success')

        // 自动评分
        const feedback = feedbackService.autoScore(result)

        expect(feedback).not.toBeNull()
        expect(feedback.source).toBe('auto')
        expect(feedback.autoScore).toBe(1.0)
        expect(feedback.finalScore).toBe(1.0)
        expect(feedback.taskId).toBe(task.taskId)
        expect(feedback.agentId).toBe(result.results[0].agentId)
        expect(feedback.capability).toBe('search')
        expect(feedback.taskContext.strategy).toBe('single')
        expect(feedback.taskContext.status).toBe('success')
      } finally {
        restore()
      }
    })

    it('generates lower auto score for failed task', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'ERR_INTERNAL', message: 'fail', retryable: false } })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)
        expect(result.status).toBe('failure')

        const feedback = feedbackService.autoScore(result)

        expect(feedback.autoScore).toBe(0.4) // 1.0 - 0.6 for failure
      } finally {
        restore()
      }
    })

    it('persists auto feedback to store', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)
        feedbackService.autoScore(result)

        // 等待异步持久化完成
        await new Promise(r => setTimeout(r, 10))

        const stored = await store.getFeedbacksByTaskId(task.taskId)
        expect(stored).toHaveLength(1)
        expect(stored[0].source).toBe('auto')
      } finally {
        restore()
      }
    })

    it('emits feedback.created event', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      const emitted = []
      eventBus.on('feedback.created', (fb) => emitted.push(fb))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)
        feedbackService.autoScore(result)

        expect(emitted).toHaveLength(1)
        expect(emitted[0].data.source).toBe('auto')
      } finally {
        restore()
      }
    })
  })

  describe('用户提交评分后综合评分更新', () => {
    it('combines auto score with user score', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)

        // 先自动评分
        feedbackService.autoScore(result)
        await new Promise(r => setTimeout(r, 10))

        // 再用户评分
        const userFeedback = await feedbackService.submitUserFeedback(result, {
          userScore: 3,
          comment: '一般般'
        })

        expect(userFeedback.source).toBe('user')
        expect(userFeedback.userScore).toBe(3)
        expect(userFeedback.userComment).toBe('一般般')
        expect(userFeedback.autoScore).toBe(1.0) // 来自自动评分
        // final = 1.0 * 0.3 + 0.5 * 0.7 = 0.3 + 0.35 = 0.65
        expect(userFeedback.finalScore).toBeCloseTo(0.65, 3)
      } finally {
        restore()
      }
    })

    it('stores both auto and user feedback', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({ status: 'success', output: 'ok' })
      }))

      try {
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索' },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
        })

        const result = await executor.run(task)
        feedbackService.autoScore(result)
        await new Promise(r => setTimeout(r, 10))

        await feedbackService.submitUserFeedback(result, {
          userScore: 4,
          comment: '不错'
        })

        const stored = await store.getFeedbacksByTaskId(task.taskId)
        expect(stored).toHaveLength(2)
        expect(stored.find(f => f.source === 'auto')).toBeDefined()
        expect(stored.find(f => f.source === 'user')).toBeDefined()
      } finally {
        restore()
      }
    })

    it('computes user feedback without prior auto score', async () => {
      const task = createTaskRecord({
        strategy: 'single',
        request: { description: '搜索' },
        steps: [{ stepIndex: 0, capability: 'search', description: '搜索' }]
      })

      // 模拟一个已完成的任务（未经过 executor.run）
      const completedTask = {
        ...task,
        status: 'success',
        results: [{
          stepIndex: 0,
          agentId: 'agent_test_001',
          status: 'success',
          startedAt: Date.now() - 1000,
          finishedAt: Date.now()
        }]
      }

      const userFeedback = await feedbackService.submitUserFeedback(completedTask, {
        userScore: 5
      })

      expect(userFeedback.autoScore).toBe(1.0) // 重新计算
      // final = 1.0 * 0.3 + 1.0 * 0.7 = 1.0
      expect(userFeedback.finalScore).toBe(1.0)
    })
  })

  describe('完整反馈流程', () => {
    it('task completes → auto score → user score → both persisted', async () => {
      hive.register(makeSpec({
        capabilities: ['search'],
        endpoint: 'http://worker1:4001'
      }), 'sess_1')

      const restore = mockFetch(() => ({
        ok: true,
        json: async () => ({
          status: 'success',
          output: { results: ['a', 'b'] },
          summary: '搜索完成',
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      }))

      const emittedEvents = []
      eventBus.on('feedback.created', (fb) => emittedEvents.push(fb))

      try {
        // 1. 执行任务
        const task = createTaskRecord({
          strategy: 'single',
          request: { description: '搜索测试', input: { q: 'hello' } },
          steps: [{ stepIndex: 0, capability: 'search', description: '搜索步骤' }]
        })

        const result = await executor.run(task)
        expect(result.status).toBe('success')

        // 2. 自动评分
        const autoFeedback = feedbackService.autoScore(result)
        expect(autoFeedback.autoScore).toBe(1.0)
        expect(autoFeedback.finalScore).toBe(1.0)
        expect(autoFeedback.taskContext.stepCount).toBe(1)
        expect(autoFeedback.taskContext.totalRetries).toBe(0)

        // 等待持久化
        await new Promise(r => setTimeout(r, 10))

        // 3. 验证自动评分已持久化
        let stored = await store.getFeedbacksByTaskId(task.taskId)
        expect(stored).toHaveLength(1)
        expect(stored[0].source).toBe('auto')

        // 4. 用户评分
        const userFeedback = await feedbackService.submitUserFeedback(result, {
          userScore: 4,
          comment: '结果还不错',
          corrections: ['可以更精确']
        })

        expect(userFeedback.source).toBe('user')
        expect(userFeedback.userScore).toBe(4)
        expect(userFeedback.corrections).toHaveLength(1)

        // 5. 验证两条反馈都已持久化
        stored = await store.getFeedbacksByTaskId(task.taskId)
        expect(stored).toHaveLength(2)

        // 6. 验证事件发射
        expect(emittedEvents).toHaveLength(2)
        expect(emittedEvents[0].data.source).toBe('auto')
        expect(emittedEvents[1].data.source).toBe('user')
      } finally {
        restore()
      }
    })

    it('returns null for invalid task in autoScore', () => {
      const result = feedbackService.autoScore(null)
      expect(result).toBeNull()
    })

    it('returns null for task without taskId in autoScore', () => {
      const result = feedbackService.autoScore({})
      expect(result).toBeNull()
    })
  })
})
