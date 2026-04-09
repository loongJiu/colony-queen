import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { createFeedbackRecord } from '../../src/models/feedback.js'

describe('MemoryStore', () => {
  /** @type {MemoryStore} */
  let store

  beforeEach(async () => {
    store = new MemoryStore()
    await store.init()
  })

  it('inserts and retrieves a feedback record', async () => {
    const record = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      agentId: 'agent_001',
      capability: 'search',
      source: 'auto',
      autoScore: 0.9
    })

    await store.insertFeedback(record)
    const found = await store.getFeedbackById(record.feedbackId)

    expect(found).toEqual(record)
    expect(Object.isFrozen(found)).toBe(true)
  })

  it('returns null for non-existent feedbackId', async () => {
    const found = await store.getFeedbackById('fb_nonexistent')
    expect(found).toBeNull()
  })

  it('queries feedbacks by taskId', async () => {
    const fb1 = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'auto',
      autoScore: 0.8,
      agentId: 'agent_001',
      capability: 'search'
    })
    const fb2 = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'user',
      userScore: 4,
      agentId: 'agent_001',
      capability: 'search'
    })
    const fb3 = createFeedbackRecord({
      taskId: 'task_002',
      conversationId: 'conv_002',
      source: 'auto',
      autoScore: 0.7,
      agentId: 'agent_002',
      capability: 'translate'
    })

    await store.insertFeedback(fb1)
    await store.insertFeedback(fb2)
    await store.insertFeedback(fb3)

    const results = await store.getFeedbacksByTaskId('task_001')
    expect(results).toHaveLength(2)
    expect(results.map(r => r.feedbackId)).toContain(fb1.feedbackId)
    expect(results.map(r => r.feedbackId)).toContain(fb2.feedbackId)
  })

  it('returns empty array for unknown taskId', async () => {
    const results = await store.getFeedbacksByTaskId('task_unknown')
    expect(results).toEqual([])
  })

  it('queries feedbacks by agentId with pagination', async () => {
    // 插入 5 条同一 agent 的反馈
    for (let i = 0; i < 5; i++) {
      const fb = createFeedbackRecord({
        taskId: `task_${i}`,
        conversationId: `conv_${i}`,
        source: 'auto',
        autoScore: 0.5 + i * 0.1,
        agentId: 'agent_001',
        capability: 'search'
      })
      await store.insertFeedback(fb)
    }

    // 第一页
    const page1 = await store.getFeedbacksByAgentId('agent_001', { limit: 2, offset: 0 })
    expect(page1).toHaveLength(2)

    // 第二页
    const page2 = await store.getFeedbacksByAgentId('agent_001', { limit: 2, offset: 2 })
    expect(page2).toHaveLength(2)

    // 第三页
    const page3 = await store.getFeedbacksByAgentId('agent_001', { limit: 2, offset: 4 })
    expect(page3).toHaveLength(1)
  })

  it('uses default pagination values', async () => {
    const fb = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'auto',
      autoScore: 0.9,
      agentId: 'agent_001',
      capability: 'search'
    })
    await store.insertFeedback(fb)

    const results = await store.getFeedbacksByAgentId('agent_001')
    expect(results).toHaveLength(1)
  })

  it('clears data on close', async () => {
    const fb = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'auto',
      autoScore: 0.9,
      agentId: 'agent_001',
      capability: 'search'
    })
    await store.insertFeedback(fb)
    await store.close()

    // 重新创建 store
    store = new MemoryStore()
    await store.init()
    const found = await store.getFeedbackById(fb.feedbackId)
    expect(found).toBeNull()
  })

  it('stores feedback with corrections and taskContext', async () => {
    const corrections = [{ field: 'output', suggestion: '补充数据来源' }]
    const taskContext = { description: '测试任务', strategy: 'single' }
    const record = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'auto',
      autoScore: 0.6,
      agentId: 'agent_001',
      capability: 'analysis',
      corrections,
      taskContext
    })

    await store.insertFeedback(record)
    const found = await store.getFeedbackById(record.feedbackId)

    expect(found.corrections).toEqual(corrections)
    expect(found.taskContext).toEqual(taskContext)
  })

  it('throws on duplicate feedbackId', async () => {
    const fb = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'auto',
      autoScore: 0.9,
      agentId: 'agent_001',
      capability: 'search'
    })
    await store.insertFeedback(fb)

    // 手动构造相同 feedbackId 的记录
    const duplicate = { ...fb, autoScore: 0.5 }
    await expect(store.insertFeedback(duplicate)).rejects.toThrow('Duplicate feedbackId')
  })

  it('returns feedbacks sorted by createdAt DESC for agentId queries', async () => {
    const fb1 = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'auto',
      autoScore: 0.8,
      agentId: 'agent_001',
      capability: 'search'
    })
    // 确保时间差
    await new Promise(r => setTimeout(r, 2))
    const fb2 = createFeedbackRecord({
      taskId: 'task_002',
      conversationId: 'conv_002',
      source: 'auto',
      autoScore: 0.9,
      agentId: 'agent_001',
      capability: 'search'
    })

    await store.insertFeedback(fb1)
    await store.insertFeedback(fb2)

    const results = await store.getFeedbacksByAgentId('agent_001')
    expect(results).toHaveLength(2)
    // fb2 更新，应排在前面
    expect(results[0].feedbackId).toBe(fb2.feedbackId)
    expect(results[1].feedbackId).toBe(fb1.feedbackId)
  })
})
