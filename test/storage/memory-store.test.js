import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { createFeedbackRecord } from '../../src/models/feedback.js'
import { createPlanCaseRecord } from '../../src/models/plan-case.js'
import { createWorkSessionRecord } from '../../src/models/work-session.js'

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

  // ─── PlanCase 操作 ───────────────────────────────────────

  describe('PlanCase', () => {
    it('inserts and retrieves a plan case', async () => {
      const record = createPlanCaseRecord({
        inputText: '搜索AI新闻',
        plan: { strategy: 'single', steps: [{ capability: 'search', description: '搜索' }] },
        score: 0.85,
        status: 'confirmed'
      })

      await store.insertPlanCase(record)
      const found = await store.getPlanCaseById(record.caseId)

      expect(found).toEqual(record)
      expect(Object.isFrozen(found)).toBe(true)
    })

    it('returns null for non-existent caseId', async () => {
      const found = await store.getPlanCaseById('pc_nonexistent')
      expect(found).toBeNull()
    })

    it('throws on duplicate caseId', async () => {
      const record = createPlanCaseRecord({
        inputText: 'test',
        plan: { strategy: 'single', steps: [] }
      })
      await store.insertPlanCase(record)

      const duplicate = { ...record }
      await expect(store.insertPlanCase(duplicate)).rejects.toThrow('Duplicate caseId')
    })

    it('searches similar cases by keywords', async () => {
      // 确认案例 1
      const r1 = createPlanCaseRecord({
        inputText: '搜索最新的AI新闻并生成摘要',
        plan: { strategy: 'serial', steps: [] },
        score: 0.9,
        status: 'confirmed'
      })
      await store.insertPlanCase(r1)

      // 确认案例 2
      const r2 = createPlanCaseRecord({
        inputText: '翻译技术文档为中文',
        plan: { strategy: 'single', steps: [] },
        score: 0.8,
        status: 'confirmed'
      })
      await store.insertPlanCase(r2)

      // 搜索包含 "搜索" 的案例
      const results = await store.searchSimilarCases('搜索新闻', { limit: 5 })
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some(r => r.caseId === r1.caseId)).toBe(true)
    })

    it('filters by minScore in search', async () => {
      const r1 = createPlanCaseRecord({
        inputText: '搜索AI新闻',
        plan: { strategy: 'single', steps: [] },
        score: 0.9,
        status: 'confirmed'
      })
      const r2 = createPlanCaseRecord({
        inputText: '搜索技术文档',
        plan: { strategy: 'single', steps: [] },
        score: 0.5,
        status: 'confirmed'
      })
      await store.insertPlanCase(r1)
      await store.insertPlanCase(r2)

      const results = await store.searchSimilarCases('搜索', { minScore: 0.7 })
      expect(results.every(r => r.score >= 0.7)).toBe(true)
    })

    it('only returns confirmed cases in search', async () => {
      const pending = createPlanCaseRecord({
        inputText: '搜索新闻',
        plan: { strategy: 'single', steps: [] },
        score: 0.9,
        status: 'pending'
      })
      await store.insertPlanCase(pending)

      const results = await store.searchSimilarCases('搜索新闻')
      expect(results).toHaveLength(0)
    })

    it('updates plan case fields', async () => {
      const record = createPlanCaseRecord({
        inputText: '搜索新闻',
        plan: { strategy: 'single', steps: [] }
      })
      await store.insertPlanCase(record)

      const updated = await store.updatePlanCase(record.caseId, {
        score: 0.95,
        status: 'confirmed'
      })

      expect(updated).not.toBeNull()
      expect(updated.score).toBe(0.95)
      expect(updated.status).toBe('confirmed')
      expect(updated.caseId).toBe(record.caseId)
      expect(updated.inputText).toBe(record.inputText)
      expect(updated.updatedAt).toBeGreaterThanOrEqual(record.createdAt)
    })

    it('returns null when updating non-existent case', async () => {
      const result = await store.updatePlanCase('pc_nonexistent', { score: 0.5 })
      expect(result).toBeNull()
    })

    it('gets recent cases sorted by createdAt DESC', async () => {
      const r1 = createPlanCaseRecord({ inputText: '任务1', plan: {} })
      await new Promise(r => setTimeout(r, 2))
      const r2 = createPlanCaseRecord({ inputText: '任务2', plan: {} })
      await new Promise(r => setTimeout(r, 2))
      const r3 = createPlanCaseRecord({ inputText: '任务3', plan: {} })

      await store.insertPlanCase(r1)
      await store.insertPlanCase(r2)
      await store.insertPlanCase(r3)

      const recent = await store.getRecentCases({ limit: 2 })
      expect(recent).toHaveLength(2)
      expect(recent[0].caseId).toBe(r3.caseId)
      expect(recent[1].caseId).toBe(r2.caseId)
    })

    it('returns all cases when limit is large', async () => {
      for (let i = 0; i < 5; i++) {
        const r = createPlanCaseRecord({ inputText: `任务${i}`, plan: {} })
        await store.insertPlanCase(r)
      }

      const all = await store.getRecentCases({ limit: 100 })
      expect(all).toHaveLength(5)
    })

    it('clears plan cases on close', async () => {
      const record = createPlanCaseRecord({ inputText: 'test', plan: {} })
      await store.insertPlanCase(record)
      await store.close()

      store = new MemoryStore()
      await store.init()
      const found = await store.getPlanCaseById(record.caseId)
      expect(found).toBeNull()
    })
  })

  // ─── WorkSession 操作 ────────────────────────────────────

  describe('WorkSession', () => {
    it('inserts and retrieves a session', async () => {
      const record = createWorkSessionRecord({ title: '竞品分析' })
      await store.insertSession(record)

      const found = await store.getSession(record.sessionId)
      expect(found).toEqual(record)
      expect(Object.isFrozen(found)).toBe(true)
    })

    it('returns null for non-existent sessionId', async () => {
      const found = await store.getSession('wsess_nonexistent')
      expect(found).toBeNull()
    })

    it('throws on duplicate sessionId', async () => {
      const record = createWorkSessionRecord({ title: 'test' })
      await store.insertSession(record)

      const duplicate = { ...record }
      await expect(store.insertSession(duplicate)).rejects.toThrow('Duplicate sessionId')
    })

    it('updates session fields', async () => {
      const record = createWorkSessionRecord({ title: 'test' })
      await store.insertSession(record)

      const updated = await store.updateSession(record.sessionId, {
        conversationIds: ['conv_001'],
        keyOutputs: { conv_001: { type: 'output', summary: '结果' } }
      })

      expect(updated).not.toBeNull()
      expect(updated.conversationIds).toEqual(['conv_001'])
      expect(updated.keyOutputs['conv_001'].summary).toBe('结果')
      expect(updated.sessionId).toBe(record.sessionId)
      expect(updated.title).toBe(record.title)
      expect(updated.updatedAt).toBeGreaterThanOrEqual(record.createdAt)
    })

    it('returns null when updating non-existent session', async () => {
      const result = await store.updateSession('wsess_nonexistent', { title: 'new' })
      expect(result).toBeNull()
    })

    it('lists sessions sorted by createdAt DESC', async () => {
      const s1 = createWorkSessionRecord({ title: 'session1' })
      await new Promise(r => setTimeout(r, 2))
      const s2 = createWorkSessionRecord({ title: 'session2' })
      await new Promise(r => setTimeout(r, 2))
      const s3 = createWorkSessionRecord({ title: 'session3' })

      await store.insertSession(s1)
      await store.insertSession(s2)
      await store.insertSession(s3)

      const list = await store.listSessions()
      expect(list).toHaveLength(3)
      expect(list[0].sessionId).toBe(s3.sessionId)
      expect(list[2].sessionId).toBe(s1.sessionId)
    })

    it('filters sessions by status', async () => {
      const s1 = createWorkSessionRecord({ title: 'active', status: 'active' })
      const s2 = createWorkSessionRecord({ title: 'archived', status: 'archived' })

      await store.insertSession(s1)
      await store.insertSession(s2)

      const active = await store.listSessions({ status: 'active' })
      expect(active).toHaveLength(1)
      expect(active[0].title).toBe('active')
    })

    it('supports pagination in listSessions', async () => {
      for (let i = 0; i < 5; i++) {
        const record = createWorkSessionRecord({ title: `session${i}` })
        await store.insertSession(record)
      }

      const page = await store.listSessions({ limit: 2, offset: 0 })
      expect(page).toHaveLength(2)
    })

    it('clears sessions on close', async () => {
      const record = createWorkSessionRecord({ title: 'test' })
      await store.insertSession(record)
      await store.close()

      store = new MemoryStore()
      await store.init()
      const found = await store.getSession(record.sessionId)
      expect(found).toBeNull()
    })
  })
})
