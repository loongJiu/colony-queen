/**
 * 存储层性能测试
 *
 * 验证反馈查询和画像查询在大数据量下的响应时间。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { createFeedbackRecord } from '../../src/models/feedback.js'
import { createCapabilityProfile } from '../../src/models/capability-profile.js'

describe('Storage Performance', () => {
  let store

  beforeEach(async () => {
    store = new MemoryStore()
    await store.init()
  })

  afterEach(async () => {
    await store.close()
  })

  describe('反馈查询性能', () => {
    async function seedFeedbacks(count) {
      const agentIds = ['agent_001', 'agent_002', 'agent_003', 'agent_004', 'agent_005']
      const records = []
      for (let i = 0; i < count; i++) {
        records.push(createFeedbackRecord({
          taskId: `task_perf_${i}`,
          conversationId: `conv_${i}`,
          agentId: agentIds[i % agentIds.length],
          capability: 'search',
          source: 'auto',
          autoScore: Math.random(),
          finalScore: Math.random()
        }))
        // 每批次让时间戳推进，避免 feedbackId 碰撞
        if (i % 100 === 99) {
          await new Promise(r => setTimeout(r, 1))
        }
      }
      for (const record of records) {
        await store.insertFeedback(record)
      }
    }

    it('getFeedbacksByAgentId 在 1000 条记录下响应时间 < 10ms', async () => {
      await seedFeedbacks(1000)

      const start = performance.now()
      const results = await store.getFeedbacksByAgentId('agent_001')
      const duration = performance.now() - start

      expect(results.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(10)
    })

    it('getAllFeedbacks 在 1000 条记录下响应时间 < 10ms', async () => {
      await seedFeedbacks(1000)

      const start = performance.now()
      const results = await store.getAllFeedbacks({ limit: 100 })
      const duration = performance.now() - start

      expect(results.length).toBe(100)
      expect(duration).toBeLessThan(10)
    })

    it('getFeedbacksByTaskId 在 1000 条记录下响应时间 < 10ms', async () => {
      await seedFeedbacks(1000)

      const start = performance.now()
      const results = await store.getFeedbacksByTaskId('task_perf_500')
      const duration = performance.now() - start

      expect(results.length).toBe(1)
      expect(duration).toBeLessThan(10)
    })
  })

  describe('画像查询性能', () => {
    async function seedProfiles(agentCount, capsPerAgent) {
      const capabilities = ['search', 'code_generation', 'data_analysis', 'text_writing', 'debugging']
      for (let a = 0; a < agentCount; a++) {
        for (let c = 0; c < capsPerAgent; c++) {
          const profile = createCapabilityProfile({
            agentId: `agent_${String(a).padStart(3, '0')}`,
            capability: capabilities[c % capabilities.length],
            actualScore: 0.3 + Math.random() * 0.7,
            taskCount: Math.floor(Math.random() * 50),
            successRate: Math.random()
          })
          await store.upsertProfile(profile)
        }
      }
    }

    it('getAllProfiles 在 500 条画像下响应时间 < 10ms', async () => {
      await seedProfiles(100, 5)

      const start = performance.now()
      const results = await store.getAllProfiles()
      const duration = performance.now() - start

      expect(results.length).toBe(500)
      expect(duration).toBeLessThan(10)
    })

    it('getProfilesByAgentId 在 500 条画像下响应时间 < 10ms', async () => {
      await seedProfiles(100, 5)

      const start = performance.now()
      const results = await store.getProfilesByAgentId('agent_050')
      const duration = performance.now() - start

      expect(results.length).toBe(5)
      expect(duration).toBeLessThan(10)
    })

    it('upsertProfile 批量写入 500 条性能', async () => {
      const start = performance.now()
      for (let i = 0; i < 500; i++) {
        const profile = createCapabilityProfile({
          agentId: `agent_${String(i % 100).padStart(3, '0')}`,
          capability: ['search', 'code_generation', 'data_analysis', 'text_writing', 'debugging'][i % 5],
          actualScore: Math.random(),
          taskCount: i,
          successRate: Math.random()
        })
        await store.upsertProfile(profile)
      }
      const duration = performance.now() - start

      expect(duration).toBeLessThan(2000)
    })
  })
})
