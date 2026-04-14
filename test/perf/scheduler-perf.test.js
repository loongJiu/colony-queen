/**
 * Scheduler 调度性能测试
 *
 * 验证大数据量下 selectAgent 的响应时间和 softmax 采样分布。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { CircuitBreaker } from '../../src/services/circuit-breaker.js'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { createCapabilityProfile } from '../../src/models/capability-profile.js'

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

describe('Scheduler Performance', () => {
  let hive, scheduler, store, circuitBreaker

  beforeEach(async () => {
    hive = new Hive()
    circuitBreaker = new CircuitBreaker()
    store = new MemoryStore()
    await store.init()
    scheduler = new Scheduler({ hive, circuitBreaker, store })
  })

  afterEach(async () => {
    await store.close()
  })

  async function setupAgentsAndProfiles(agentCount) {
    const records = []
    for (let i = 0; i < agentCount; i++) {
      const rec = hive.register(makeSpec({
        capabilities: ['search', 'code_generation'],
        endpoint: `http://agent${i}:4001`
      }), `sess_${i}`)
      records.push(rec)
    }

    // 为每个 agent 创建画像
    for (const rec of records) {
      for (const cap of ['search', 'code_generation']) {
        const profile = createCapabilityProfile({
          agentId: rec.agentId,
          capability: cap,
          actualScore: 0.2 + Math.random() * 0.8,
          taskCount: 15 + Math.floor(Math.random() * 30),
          successRate: 0.3 + Math.random() * 0.7,
          recentTrend: ['improving', 'stable', 'declining'][Math.floor(Math.random() * 3)]
        })
        await store.upsertProfile(profile)
      }
    }

    await scheduler.refreshProfiles()
    return records
  }

  it('selectAgent 在 10 个 Agent 下响应时间 < 5ms', async () => {
    await setupAgentsAndProfiles(10)

    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      scheduler.selectAgent('search')
    }
    const duration = performance.now() - start

    // 100 次调度的平均时间
    const avgMs = duration / 100
    expect(avgMs).toBeLessThan(5)
  })

  it('selectAgent 在 50 个 Agent 下响应时间 < 5ms', async () => {
    await setupAgentsAndProfiles(50)

    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      scheduler.selectAgent('search')
    }
    const duration = performance.now() - start

    const avgMs = duration / 100
    expect(avgMs).toBeLessThan(5)
  })

  it('softmax 采样分布合理：高权重 Agent 被选中更多', async () => {
    hive.register(makeSpec({
      capabilities: ['search'],
      endpoint: 'http://high:4001'
    }), 'sess_high')

    hive.register(makeSpec({
      capabilities: ['search'],
      endpoint: 'http://mid:4001'
    }), 'sess_mid')

    hive.register(makeSpec({
      capabilities: ['search'],
      endpoint: 'http://low:4001'
    }), 'sess_low')

    const agents = hive.listAll()

    // 创建差异显著的画像
    const highAgent = agents.find(a => a.endpoint.includes('high'))
    const midAgent = agents.find(a => a.endpoint.includes('mid'))
    const lowAgent = agents.find(a => a.endpoint.includes('low'))

    await store.upsertProfile(createCapabilityProfile({
      agentId: highAgent.agentId, capability: 'search',
      actualScore: 0.95, taskCount: 20, successRate: 0.95, recentTrend: 'improving'
    }))
    await store.upsertProfile(createCapabilityProfile({
      agentId: midAgent.agentId, capability: 'search',
      actualScore: 0.6, taskCount: 20, successRate: 0.6, recentTrend: 'stable'
    }))
    await store.upsertProfile(createCapabilityProfile({
      agentId: lowAgent.agentId, capability: 'search',
      actualScore: 0.2, taskCount: 20, successRate: 0.2, recentTrend: 'declining'
    }))

    await scheduler.refreshProfiles()

    // 统计 200 次调度分布
    const dist = { [highAgent.agentId]: 0, [midAgent.agentId]: 0, [lowAgent.agentId]: 0 }
    for (let i = 0; i < 200; i++) {
      const selected = scheduler.selectAgent('search')
      dist[selected.agentId]++
    }

    // high 应该最多，low 应该最少
    expect(dist[highAgent.agentId]).toBeGreaterThan(dist[lowAgent.agentId])
    // high 应该比 mid 多
    expect(dist[highAgent.agentId]).toBeGreaterThan(dist[midAgent.agentId])
    // mid 应该比 low 多
    expect(dist[midAgent.agentId]).toBeGreaterThan(dist[lowAgent.agentId])
  })

  it('selectAgentExcluding 在 10 个 Agent 下响应时间 < 5ms', async () => {
    const records = await setupAgentsAndProfiles(10)

    // 排除前 5 个 agent
    const excludeIds = records.slice(0, 5).map(r => r.agentId)

    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      scheduler.selectAgentExcluding('search', excludeIds)
    }
    const duration = performance.now() - start

    const avgMs = duration / 100
    expect(avgMs).toBeLessThan(5)
  })

  it('refreshProfiles 在 50 个 Agent 下响应时间 < 100ms', async () => {
    await setupAgentsAndProfiles(50)

    const start = performance.now()
    await scheduler.refreshProfiles()
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
  })
})
