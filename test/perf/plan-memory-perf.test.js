/**
 * PlanMemory 检索性能测试
 *
 * 验证大数据量下的 searchSimilarCases 和 buildFewShotContext 响应时间。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PlanMemory } from '../../src/services/plan-memory.js'
import { MemoryStore } from '../../src/storage/memory-store.js'

describe('PlanMemory Performance', () => {
  let store, planMemory

  beforeEach(async () => {
    store = new MemoryStore()
    await store.init()
    planMemory = new PlanMemory({ store })
  })

  afterEach(async () => {
    await store.close()
  })

  async function seedCases(count) {
    const templates = [
      '搜索竞品数据分析',
      '生成代码审查报告',
      '调试网络连接问题',
      '编写技术文档',
      '数据可视化图表',
      '市场分析报告生成',
      '搜索新闻热点',
      '代码重构方案',
      '用户行为分析',
      '自动化测试编写'
    ]

    for (let i = 0; i < count; i++) {
      const template = templates[i % templates.length]
      await planMemory.recordPending(`${template}_${i}`, {
        strategy: i % 3 === 0 ? 'single' : (i % 3 === 1 ? 'serial' : 'parallel'),
        steps: [{ stepIndex: 0, capability: 'search', description: `${template} 步骤` }]
      }, `task_perf_${i}`)

      const caseId = planMemory.getCaseIdByTaskId(`task_perf_${i}`)
      const score = 0.7 + Math.random() * 0.3
      await planMemory.recordSuccess(caseId, score)
    }
  }

  it('searchSimilarCases 在 1000 条记录下响应时间 < 50ms', async () => {
    await seedCases(1000)

    const start = performance.now()
    const results = await planMemory.searchSimilar('搜索竞品数据分析', 5)
    const duration = performance.now() - start

    expect(results.length).toBeGreaterThan(0)
    expect(duration).toBeLessThan(50)
  })

  it('buildFewShotContext 在 1000 条记录下响应时间 < 50ms', async () => {
    await seedCases(1000)

    const start = performance.now()
    const context = await planMemory.buildFewShotContext('搜索竞品数据分析', 3)
    const duration = performance.now() - start

    expect(context).toContain('历史成功案例参考')
    expect(duration).toBeLessThan(50)
  })

  it('recordPending 批量插入 1000 条性能', async () => {
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      await planMemory.recordPending(`测试输入_${i}`, {
        strategy: 'single',
        steps: [{ stepIndex: 0, capability: 'search', description: '测试' }]
      }, `task_batch_${i}`)
    }
    const duration = performance.now() - start

    // 1000 条插入应在合理时间内完成
    expect(duration).toBeLessThan(5000)
  })
})
