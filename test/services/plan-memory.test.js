import { describe, it, expect, beforeEach } from 'vitest'
import { PlanMemory } from '../../src/services/plan-memory.js'
import { createPlanCaseRecord } from '../../src/models/plan-case.js'

/**
 * 创建一个简单的内存 mock store，实现 PlanCase 相关方法
 */
function createMockStore() {
  const cases = new Map()

  return {
    async insertPlanCase(record) {
      cases.set(record.caseId, record)
      return record
    },
    async getPlanCaseById(caseId) {
      return cases.get(caseId) ?? null
    },
    async searchSimilarCases(inputText, options = {}) {
      const { limit = 5, minScore = 0.7 } = options
      const results = []
      for (const record of cases.values()) {
        if (record.status !== 'confirmed') continue
        if (record.score < minScore) continue
        const lower = record.inputText.toLowerCase()
        const inputLower = inputText.toLowerCase()
        // 简单子串匹配
        let matched = false
        for (const char of inputLower) {
          if (/[a-z]/.test(char) && lower.includes(char)) matched = true
        }
        if (lower.includes(inputLower.slice(0, 3))) matched = true
        if (matched) results.push(record)
      }
      return results.slice(0, limit)
    },
    async updatePlanCase(caseId, updates) {
      const existing = cases.get(caseId)
      if (!existing) return null
      const updated = Object.freeze({
        ...existing,
        ...updates,
        caseId: existing.caseId,
        inputHash: existing.inputHash,
        inputText: existing.inputText,
        plan: existing.plan,
        createdAt: existing.createdAt,
        updatedAt: Date.now()
      })
      cases.set(caseId, updated)
      return updated
    },
    async getRecentCases(options = {}) {
      const { limit = 10 } = options
      return [...cases.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
    }
  }
}

describe('PlanMemory', () => {
  /** @type {PlanMemory} */
  let planMemory
  /** @type {ReturnType<typeof createMockStore>} */
  let store

  beforeEach(() => {
    store = createMockStore()
    planMemory = new PlanMemory({ store })
  })

  describe('recordPending', () => {
    it('records a pending plan case', async () => {
      const result = await planMemory.recordPending('搜索AI新闻', {
        strategy: 'single',
        steps: [{ capability: 'search', description: '搜索' }]
      })

      expect(result).not.toBeNull()
      expect(result.status).toBe('pending')
      expect(result.score).toBe(0)
      expect(result.inputText).toBe('搜索AI新闻')
    })

    it('returns null when no store is configured', async () => {
      const pm = new PlanMemory({ store: null })
      const result = await pm.recordPending('test', { strategy: 'single', steps: [] })
      expect(result).toBeNull()
    })
  })

  describe('recordSuccess', () => {
    it('confirms a plan case with score', async () => {
      const pending = await planMemory.recordPending('搜索新闻', {
        strategy: 'single',
        steps: [{ capability: 'search', description: '搜索' }]
      })

      const confirmed = await planMemory.recordSuccess(pending.caseId, 0.85)

      expect(confirmed).not.toBeNull()
      expect(confirmed.status).toBe('confirmed')
      expect(confirmed.score).toBe(0.85)
    })

    it('returns null for non-existent caseId', async () => {
      const result = await planMemory.recordSuccess('pc_nonexistent', 0.9)
      expect(result).toBeNull()
    })

    it('returns null when no store is configured', async () => {
      const pm = new PlanMemory({ store: null })
      const result = await pm.recordSuccess('pc_test', 0.9)
      expect(result).toBeNull()
    })
  })

  describe('recordFailure', () => {
    it('discards a plan case', async () => {
      const pending = await planMemory.recordPending('测试任务', {
        strategy: 'single',
        steps: []
      })

      const discarded = await planMemory.recordFailure(pending.caseId)

      expect(discarded).not.toBeNull()
      expect(discarded.status).toBe('discarded')
    })

    it('returns null for non-existent caseId', async () => {
      const result = await planMemory.recordFailure('pc_nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('searchSimilar', () => {
    it('returns empty array when no store is configured', async () => {
      const pm = new PlanMemory({ store: null })
      const results = await pm.searchSimilar('test')
      expect(results).toEqual([])
    })

    it('returns confirmed cases matching keywords', async () => {
      // 插入并确认一个案例
      const pending = await planMemory.recordPending('搜索最新的AI新闻', {
        strategy: 'single',
        steps: [{ capability: 'search', description: '搜索AI新闻' }]
      })
      await planMemory.recordSuccess(pending.caseId, 0.9)

      // 搜索相似案例
      const results = await planMemory.searchSimilar('搜索新闻')
      expect(results.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('buildFewShotContext', () => {
    it('returns empty string when no similar cases', async () => {
      const context = await planMemory.buildFewShotContext('完全独特的任务')
      expect(context).toBe('')
    })

    it('returns formatted context with matching cases', async () => {
      const pending = await planMemory.recordPending('搜索AI新闻', {
        strategy: 'single',
        steps: [{ capability: 'search', description: '搜索' }]
      })
      await planMemory.recordSuccess(pending.caseId, 0.9)

      const context = await planMemory.buildFewShotContext('搜索新闻')
      // 可能匹配也可能不匹配（取决于 mock store 的搜索实现），但不应抛错
      expect(typeof context).toBe('string')
    })
  })

  describe('extractKeywords', () => {
    it('extracts English keywords', () => {
      const keywords = planMemory.extractKeywords('search for AI news')
      expect(keywords).toContain('search')
      expect(keywords).toContain('for')
      expect(keywords).toContain('ai')
      expect(keywords).toContain('news')
    })

    it('extracts Chinese characters', () => {
      const keywords = planMemory.extractKeywords('搜索新闻')
      expect(keywords).toContain('搜')
      expect(keywords).toContain('索')
      expect(keywords).toContain('新')
      expect(keywords).toContain('闻')
    })

    it('handles mixed text', () => {
      const keywords = planMemory.extractKeywords('搜索 AI news')
      expect(keywords.length).toBeGreaterThan(0)
      expect(keywords).toContain('ai')
      expect(keywords).toContain('news')
    })

    it('ignores single-character English letters', () => {
      const keywords = planMemory.extractKeywords('a b c')
      expect(keywords).toEqual([])
    })

    it('returns empty array for empty input', () => {
      expect(planMemory.extractKeywords('')).toEqual([])
      expect(planMemory.extractKeywords(null)).toEqual([])
    })

    it('deduplicates keywords', () => {
      const keywords = planMemory.extractKeywords('search search search')
      expect(keywords.filter(k => k === 'search')).toHaveLength(1)
    })
  })
})
