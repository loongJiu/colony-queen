import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionService } from '../../src/services/session-service.js'
import { MemoryStore } from '../../src/storage/memory-store.js'

describe('SessionService', () => {
  let service
  let store

  beforeEach(async () => {
    store = new MemoryStore()
    await store.init()
    service = new SessionService({ store })
  })

  afterEach(async () => {
    await store.close()
  })

  describe('createSession', () => {
    it('creates a session with title', async () => {
      const session = await service.createSession('竞品分析项目')

      expect(session.sessionId).toMatch(/^wsess_/)
      expect(session.title).toBe('竞品分析项目')
      expect(session.status).toBe('active')
      expect(session.conversationIds).toEqual([])
    })

    it('creates a session with shared context', async () => {
      const sharedContext = { project: 'alpha' }
      const session = await service.createSession('test', sharedContext)

      expect(session.sharedContext).toEqual(sharedContext)
    })

    it('persists session to store', async () => {
      const session = await service.createSession('test')
      const found = await store.getSession(session.sessionId)
      expect(found).not.toBeNull()
      expect(found.title).toBe('test')
    })
  })

  describe('getSession', () => {
    it('returns session by id', async () => {
      const created = await service.createSession('test')
      const found = await service.getSession(created.sessionId)
      expect(found).toEqual(created)
    })

    it('returns null for non-existent session', async () => {
      const found = await service.getSession('wsess_nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('addConversation', () => {
    it('adds conversation to session', async () => {
      const session = await service.createSession('test')
      const updated = await service.addConversation(session.sessionId, 'conv_001')

      expect(updated.conversationIds).toContain('conv_001')
    })

    it('adds keyOutput for the conversation', async () => {
      const session = await service.createSession('test')
      const keyOutput = { type: 'output', summary: '搜索结果' }
      const updated = await service.addConversation(session.sessionId, 'conv_001', keyOutput)

      expect(updated.keyOutputs['conv_001']).toEqual(keyOutput)
    })

    it('does not duplicate conversationId', async () => {
      const session = await service.createSession('test')
      await service.addConversation(session.sessionId, 'conv_001')
      const updated = await service.addConversation(session.sessionId, 'conv_001')

      expect(updated.conversationIds.filter(id => id === 'conv_001')).toHaveLength(1)
    })

    it('adds multiple conversations', async () => {
      const session = await service.createSession('test')
      await service.addConversation(session.sessionId, 'conv_001')
      await service.addConversation(session.sessionId, 'conv_002')
      const updated = await service.getSession(session.sessionId)

      expect(updated.conversationIds).toEqual(['conv_001', 'conv_002'])
    })

    it('returns null for non-existent session', async () => {
      const result = await service.addConversation('wsess_nonexistent', 'conv_001')
      expect(result).toBeNull()
    })
  })

  describe('addSharedContext', () => {
    it('merges new context into existing', async () => {
      const session = await service.createSession('test', { project: 'alpha' })
      const updated = await service.addSharedContext(session.sessionId, { goal: '分析' })

      expect(updated.sharedContext).toEqual({ project: 'alpha', goal: '分析' })
    })

    it('overwrites existing key with new value', async () => {
      const session = await service.createSession('test', { version: 1 })
      const updated = await service.addSharedContext(session.sessionId, { version: 2 })

      expect(updated.sharedContext.version).toBe(2)
    })

    it('returns null for non-existent session', async () => {
      const result = await service.addSharedContext('wsess_nonexistent', { key: 'value' })
      expect(result).toBeNull()
    })
  })

  describe('listSessions', () => {
    it('returns all sessions sorted by createdAt DESC', async () => {
      await service.createSession('session1')
      // 确保不同毫秒创建，避免排序不稳定
      await new Promise(r => setTimeout(r, 2))
      await service.createSession('session2')
      await new Promise(r => setTimeout(r, 2))
      await service.createSession('session3')

      const sessions = await service.listSessions()
      expect(sessions).toHaveLength(3)
      expect(sessions[0].title).toBe('session3')
      expect(sessions[2].title).toBe('session1')
    })

    it('filters by status', async () => {
      const s1 = await service.createSession('active')
      await service.archiveSession(s1.sessionId)
      await service.createSession('active2')

      const active = await service.listSessions({ status: 'active' })
      expect(active).toHaveLength(1)
      expect(active[0].title).toBe('active2')
    })

    it('supports pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createSession(`session${i}`)
      }

      const page = await service.listSessions({ limit: 2, offset: 0 })
      expect(page).toHaveLength(2)
    })
  })

  describe('archiveSession', () => {
    it('sets status to archived', async () => {
      const session = await service.createSession('test')
      const archived = await service.archiveSession(session.sessionId)

      expect(archived.status).toBe('archived')
    })

    it('returns null for non-existent session', async () => {
      const result = await service.archiveSession('wsess_nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('resolveReferences', () => {
    it('resolves references from session keyOutputs', async () => {
      const session = await service.createSession('test')
      await service.addConversation(session.sessionId, 'conv_A', {
        type: 'output',
        summary: '搜索到10条竞品数据'
      })
      await service.addConversation(session.sessionId, 'conv_B', {
        type: 'output',
        summary: '数据分析完成'
      })

      const result = await service.resolveReferences(session.sessionId, ['conv_A', 'conv_B'])

      expect(result.references['conv_A']).toEqual({ type: 'output', summary: '搜索到10条竞品数据' })
      expect(result.references['conv_B']).toEqual({ type: 'output', summary: '数据分析完成' })
    })

    it('includes sharedContext in result', async () => {
      const session = await service.createSession('test', { project: 'alpha' })

      const result = await service.resolveReferences(session.sessionId, [])

      expect(result.sharedContext).toEqual({ project: 'alpha' })
    })

    it('skips references not found in keyOutputs', async () => {
      const session = await service.createSession('test')
      await service.addConversation(session.sessionId, 'conv_A', {
        type: 'output',
        summary: '结果A'
      })

      const result = await service.resolveReferences(session.sessionId, ['conv_A', 'conv_nonexistent'])

      expect(result.references['conv_A']).toBeDefined()
      expect(result.references['conv_nonexistent']).toBeUndefined()
    })

    it('returns empty references for non-existent session', async () => {
      const result = await service.resolveReferences('wsess_nonexistent', ['conv_A'])

      expect(result.references).toEqual({})
      expect(result.sharedContext).toEqual({})
    })
  })

  describe('extractKeyOutput', () => {
    it('extracts from finalOutput', () => {
      const result = service.extractKeyOutput({
        status: 'success',
        finalOutput: '这是最终输出结果'
      })

      expect(result.type).toBe('output')
      expect(result.summary).toBe('这是最终输出结果')
    })

    it('extracts from output when finalOutput is absent', () => {
      const result = service.extractKeyOutput({
        status: 'success',
        output: '直接输出'
      })

      expect(result.type).toBe('output')
      expect(result.summary).toBe('直接输出')
    })

    it('extracts from steps when no output', () => {
      const result = service.extractKeyOutput({
        status: 'success',
        steps: [
          { description: '搜索步骤' },
          { description: '分析步骤' }
        ]
      })

      expect(result.type).toBe('steps')
      expect(result.summary).toBe('搜索步骤; 分析步骤')
    })

    it('returns status when no output and no steps', () => {
      const result = service.extractKeyOutput({ status: 'success' })

      expect(result.type).toBe('status')
      expect(result.summary).toBe('任务状态: success')
    })

    it('returns empty for null/undefined input', () => {
      const result = service.extractKeyOutput(null)

      expect(result.type).toBe('empty')
      expect(result.summary).toBe('')
    })

    it('truncates long output to 500 chars', () => {
      const longOutput = 'a'.repeat(600)
      const result = service.extractKeyOutput({ finalOutput: longOutput })

      expect(result.summary.length).toBe(500)
    })

    it('handles JSON output by stringifying', () => {
      const result = service.extractKeyOutput({
        finalOutput: { key: 'value', nested: { a: 1 } }
      })

      expect(result.type).toBe('output')
      expect(result.summary).toContain('"key"')
    })

    it('prefers finalOutput over output', () => {
      const result = service.extractKeyOutput({
        finalOutput: '最终结果',
        output: '中间结果'
      })

      expect(result.summary).toBe('最终结果')
    })
  })
})
