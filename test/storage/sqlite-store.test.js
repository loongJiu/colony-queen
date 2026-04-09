import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { SQLiteStore } from '../../src/storage/sqlite-store.js'
import { createFeedbackRecord } from '../../src/models/feedback.js'
import { createWorkSessionRecord } from '../../src/models/work-session.js'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('SQLiteStore', () => {
  /** @type {SQLiteStore} */
  let store
  const testDir = join(tmpdir(), 'colony-queen-test-sqlite')

  beforeEach(async () => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    const dbPath = join(testDir, `test-${Date.now()}.db`)
    store = new SQLiteStore({ path: dbPath })
    await store.init()
  })

  afterEach(async () => {
    if (store) {
      await store.close()
    }
  })

  afterAll(() => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
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

    const page1 = await store.getFeedbacksByAgentId('agent_001', { limit: 2, offset: 0 })
    expect(page1).toHaveLength(2)

    const page2 = await store.getFeedbacksByAgentId('agent_001', { limit: 2, offset: 2 })
    expect(page2).toHaveLength(2)

    const page3 = await store.getFeedbacksByAgentId('agent_001', { limit: 2, offset: 4 })
    expect(page3).toHaveLength(1)
  })

  it('stores and retrieves corrections and taskContext JSON', async () => {
    const corrections = [{ field: 'output', suggestion: '补充数据来源' }]
    const taskContext = { description: '测试任务', strategy: 'single' }
    const record = createFeedbackRecord({
      taskId: 'task_001',
      conversationId: 'conv_001',
      source: 'user',
      userScore: 3,
      agentId: 'agent_001',
      capability: 'analysis',
      autoScore: 0.6,
      finalScore: 0.5,
      userComment: '结果不够完整',
      corrections,
      taskContext
    })

    await store.insertFeedback(record)
    const found = await store.getFeedbackById(record.feedbackId)

    expect(found.userScore).toBe(3)
    expect(found.userComment).toBe('结果不够完整')
    expect(found.corrections).toEqual(corrections)
    expect(found.taskContext).toEqual(taskContext)
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
    expect(results[0].feedbackId).toBe(fb2.feedbackId)
    expect(results[1].feedbackId).toBe(fb1.feedbackId)
  })

  it('persists data across store instances', async () => {
    const dbPath = join(testDir, `persist-test-${Date.now()}.db`)
    const store1 = new SQLiteStore({ path: dbPath })
    await store1.init()

    const record = createFeedbackRecord({
      taskId: 'task_persist',
      conversationId: 'conv_persist',
      source: 'auto',
      autoScore: 0.85,
      agentId: 'agent_persist',
      capability: 'test'
    })
    await store1.insertFeedback(record)
    await store1.close()

    // 重新打开同一个数据库文件
    const store2 = new SQLiteStore({ path: dbPath })
    await store2.init()
    const found = await store2.getFeedbackById(record.feedbackId)
    expect(found).not.toBeNull()
    expect(found.taskId).toBe('task_persist')
    expect(found.autoScore).toBe(0.85)
    await store2.close()
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

    it('updates session conversationIds and keyOutputs', async () => {
      const record = createWorkSessionRecord({ title: 'test' })
      await store.insertSession(record)

      const updated = await store.updateSession(record.sessionId, {
        conversationIds: ['conv_001', 'conv_002'],
        keyOutputs: {
          conv_001: { type: 'output', summary: '搜索结果' },
          conv_002: { type: 'steps', summary: '数据分析' }
        }
      })

      expect(updated).not.toBeNull()
      expect(updated.conversationIds).toEqual(['conv_001', 'conv_002'])
      expect(updated.keyOutputs['conv_001'].summary).toBe('搜索结果')
      expect(updated.keyOutputs['conv_002'].summary).toBe('数据分析')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(record.createdAt)
    })

    it('updates session sharedContext', async () => {
      const record = createWorkSessionRecord({ title: 'test', sharedContext: { a: 1 } })
      await store.insertSession(record)

      const updated = await store.updateSession(record.sessionId, {
        sharedContext: { a: 1, b: 2 }
      })

      expect(updated.sharedContext).toEqual({ a: 1, b: 2 })
    })

    it('updates session status', async () => {
      const record = createWorkSessionRecord({ title: 'test' })
      await store.insertSession(record)

      const updated = await store.updateSession(record.sessionId, { status: 'archived' })
      expect(updated.status).toBe('archived')
    })

    it('returns null when updating non-existent session', async () => {
      const result = await store.updateSession('wsess_nonexistent', { title: 'new' })
      expect(result).toBeNull()
    })

    it('lists sessions sorted by createdAt DESC', async () => {
      const s1 = createWorkSessionRecord({ title: 'first' })
      await new Promise(r => setTimeout(r, 2))
      const s2 = createWorkSessionRecord({ title: 'second' })

      await store.insertSession(s1)
      await store.insertSession(s2)

      const list = await store.listSessions()
      expect(list).toHaveLength(2)
      expect(list[0].sessionId).toBe(s2.sessionId)
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

    it('persists sessions across store instances', async () => {
      const dbPath = join(testDir, `session-persist-${Date.now()}.db`)
      const store1 = new SQLiteStore({ path: dbPath })
      await store1.init()

      const record = createWorkSessionRecord({
        title: '持久化测试',
        sharedContext: { key: 'value' }
      })
      await store1.insertSession(record)
      await store1.close()

      const store2 = new SQLiteStore({ path: dbPath })
      await store2.init()
      const found = await store2.getSession(record.sessionId)
      expect(found).not.toBeNull()
      expect(found.title).toBe('持久化测试')
      expect(found.sharedContext).toEqual({ key: 'value' })
      await store2.close()
    })
  })
})
