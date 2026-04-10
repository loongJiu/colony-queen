/**
 * Week 2 验收集成测试
 *
 * 验收标准：3 个不同能力的 Worker 注册，
 * Scheduler 能正确按能力匹配并选负载最低的。
 */

import { describe, it, expect } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { Scheduler } from '../../src/core/scheduler.js'
import { HeartbeatMonitor } from '../../src/services/heartbeat.js'
import { UnavailableError } from '../../src/utils/errors.js'

function makeSpec(overrides = {}) {
  return {
    identity: { role: 'worker', ...overrides.identity },
    runtime: { endpoint: 'http://localhost:4001', ...overrides.runtime },
    capabilities: overrides.capabilities ?? ['test'],
    model: overrides.model ?? {},
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? []
  }
}

describe('Week 2 验收', () => {
  // ── 场景 1: 3 个不同能力的 Worker 注册 ────

  it('3 个不同能力的 Worker 能成功注册到 Hive', () => {
    const hive = new Hive()

    const searcher = hive.register(makeSpec({
      identity: { name: 'Searcher' },
      capabilities: ['search']
    }), 'sess_search')

    const coder = hive.register(makeSpec({
      identity: { name: 'Coder' },
      capabilities: ['code_generation', 'debugging']
    }), 'sess_code')

    const analyst = hive.register(makeSpec({
      identity: { name: 'Analyst' },
      capabilities: ['data_analysis', 'visualization']
    }), 'sess_analyst')

    expect(hive.size).toBe(3)
    expect(searcher.capabilities).toEqual(['search'])
    expect(coder.capabilities).toEqual(['code_generation', 'debugging'])
    expect(analyst.capabilities).toEqual(['data_analysis', 'visualization'])
  })

  // ── 场景 2: Scheduler 按能力匹配 ───────────

  it('Scheduler 为每个能力选出正确的 Agent', () => {
    const hive = new Hive()
    const scheduler = new Scheduler({ hive })

    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')
    hive.register(makeSpec({ capabilities: ['code_generation', 'debugging'] }), 'sess_2')
    hive.register(makeSpec({ capabilities: ['data_analysis', 'visualization'] }), 'sess_3')

    const searcher = scheduler.selectAgent('search')
    expect(searcher.capabilities).toContain('search')

    const coder = scheduler.selectAgent('code_generation')
    expect(coder.capabilities).toContain('code_generation')

    const debugger_ = scheduler.selectAgent('debugging')
    expect(debugger_.capabilities).toContain('debugging')
    expect(debugger_.agentId).toBe(coder.agentId) // 同一个 Agent

    const analyst = scheduler.selectAgent('data_analysis')
    expect(analyst.capabilities).toContain('data_analysis')
  })

  it('Scheduler 对不存在的能力抛出 UnavailableError', () => {
    const hive = new Hive()
    const scheduler = new Scheduler({ hive })

    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    expect(() => scheduler.selectAgent('nonexistent'))
      .toThrow(UnavailableError)
  })

  // ── 场景 3: 负载均衡 — 选 load 最低的 ────

  it('多个同能力 Worker 时 Scheduler 选负载最低的', () => {
    const hive = new Hive()
    const scheduler = new Scheduler({ hive })

    hive.register(makeSpec({
      identity: { name: 'Searcher-A' },
      capabilities: ['search']
    }), 'sess_1')
    hive.register(makeSpec({
      identity: { name: 'Searcher-B' },
      capabilities: ['search']
    }), 'sess_2')
    hive.register(makeSpec({
      identity: { name: 'Searcher-C' },
      capabilities: ['search']
    }), 'sess_3')

    const a = hive.getBySessionToken('sess_1')
    const b = hive.getBySessionToken('sess_2')
    const c = hive.getBySessionToken('sess_3')

    hive.updateHeartbeat(a.agentId, { load: 0.7, activeTasks: 3 })
    hive.updateHeartbeat(b.agentId, { load: 0.2, activeTasks: 1 })
    hive.updateHeartbeat(c.agentId, { load: 0.5, activeTasks: 2 })

    const selected = scheduler.selectAgent('search')
    expect(selected.agentId).toBe(b.agentId)
    expect(selected.load).toBe(0.2)
  })

  // ── 场景 4: Waggle 消息路由 ──────────────

  it('Waggle 能定向投递和广播消息给注册的 Agent', async () => {
    const waggle = new Waggle()

    const receivedA = []
    const receivedB = []

    waggle.subscribe('agent_search_1', (msg) => receivedA.push(msg))
    waggle.subscribe('agent_code_1', (msg) => receivedB.push(msg))

    // 定向投递
    await waggle.publish('agent_search_1', { type: 'task_assign', payload: 'task1', createdAt: Date.now() })
    expect(receivedA).toHaveLength(1)
    expect(receivedB).toHaveLength(0)

    // 广播
    await waggle.broadcast({ type: 'event', payload: 'broadcast', createdAt: Date.now(), ttl: 30000 })
    expect(receivedA).toHaveLength(2)
    expect(receivedB).toHaveLength(1)
  })

  // ── 场景 5: 心跳超时 → offline → 调度排除 ──

  it('心跳超时的 Agent 被标记 offline，Scheduler 不再选择它', async () => {
    const hive = new Hive()
    const waggle = new Waggle()
    const scheduler = new Scheduler({ hive })
    const monitor = new HeartbeatMonitor({ hive, waggle, intervalMs: 100, timeoutMs: 5000 })

    hive.register(makeSpec({
      identity: { name: 'Searcher-A' },
      capabilities: ['search']
    }), 'sess_1')

    // A 注册后记录其 lastHeartbeat
    const a = hive.getBySessionToken('sess_1')
    const aHeartbeat = a.lastHeartbeat

    // 然后注册 B（在 mock 的未来时间，使 B 的 lastHeartbeat 更新）
    const originalNow = Date.now
    Date.now = () => aHeartbeat + 10000

    hive.register(makeSpec({
      identity: { name: 'Searcher-B' },
      capabilities: ['search']
    }), 'sess_2')

    const b = hive.getBySessionToken('sess_2')

    // 此时 A 的 lastHeartbeat 是 aHeartbeat，B 的 lastHeartbeat 是 aHeartbeat+10000
    // 当前 mock Date.now = aHeartbeat + 10000
    // A 超时（10000 > 5000），B 未超时（0 < 5000）

    const timedOut = await monitor.check()

    Date.now = originalNow

    expect(timedOut).toContain(a.agentId)
    expect(hive.get(a.agentId).status).toBe('offline')
    expect(hive.get(b.agentId).status).toBe('idle')

    // Scheduler 应该只选 B
    const selected = scheduler.selectAgent('search')
    expect(selected.agentId).toBe(b.agentId)
  })

  it('所有 Worker offline 时 Scheduler 抛出 UnavailableError', async () => {
    const hive = new Hive()
    const waggle = new Waggle()
    const scheduler = new Scheduler({ hive })
    const monitor = new HeartbeatMonitor({ hive, waggle, intervalMs: 100, timeoutMs: 5000 })

    hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const a = hive.getBySessionToken('sess_1')

    const originalNow = Date.now
    Date.now = () => a.lastHeartbeat + 10000
    await monitor.check()
    Date.now = originalNow

    expect(() => scheduler.selectAgent('search')).toThrow(UnavailableError)
  })

  // ── 场景 6: 心跳超时广播事件 ─────────────

  it('Agent 心跳超时时 Waggle 广播 agent.offline 事件', async () => {
    const hive = new Hive()
    const waggle = new Waggle()
    const monitor = new HeartbeatMonitor({ hive, waggle, intervalMs: 100, timeoutMs: 5000 })

    const agent = hive.register(makeSpec({ capabilities: ['search'] }), 'sess_1')

    const events = []
    waggle.subscribe('monitor', (msg) => events.push(msg))

    const originalNow = Date.now
    Date.now = () => agent.lastHeartbeat + 10000
    await monitor.check()
    Date.now = originalNow

    expect(events).toHaveLength(1)
    expect(events[0].payload.event).toBe('agent.offline')
    expect(events[0].payload.agentId).toBe(agent.agentId)
  })

  // ── 场景 7: 完整链路 — 注册→调度→消息投递→心跳超时 ──

  it('完整链路：注册→调度→消息→心跳超时→调度排除', async () => {
    const hive = new Hive()
    const waggle = new Waggle({ maxSize: 100 })
    const scheduler = new Scheduler({ hive })
    const monitor = new HeartbeatMonitor({ hive, waggle, intervalMs: 100, timeoutMs: 5000 })

    // 1. 注册 Searcher（先注册，将用来模拟超时）
    const s1 = hive.register(makeSpec({
      identity: { name: 'Searcher' },
      capabilities: ['search']
    }), 'sess_1')
    const s1Heartbeat = s1.lastHeartbeat

    // 2. mock 到未来时间注册 Coder 和 Analyst，它们的 lastHeartbeat 更新
    const originalNow = Date.now
    Date.now = () => s1Heartbeat + 10000

    hive.register(makeSpec({
      identity: { name: 'Coder' },
      capabilities: ['code_generation']
    }), 'sess_2')

    hive.register(makeSpec({
      identity: { name: 'Analyst' },
      capabilities: ['data_analysis']
    }), 'sess_3')

    // 3. 调度验证（在 mock 时间下）
    expect(scheduler.selectAgent('search').agentId).toBe(s1.agentId)
    expect(scheduler.selectAgent('code_generation').capabilities).toContain('code_generation')
    expect(scheduler.selectAgent('data_analysis').capabilities).toContain('data_analysis')

    // 4. 消息投递
    const inbox = []
    waggle.subscribe(s1.agentId, (msg) => inbox.push(msg))
    await waggle.publish(s1.agentId, { type: 'task_assign', payload: { task: 'search something' }, createdAt: Date.now(), priority: 3, ttl: 30000 })
    expect(inbox).toHaveLength(1)

    // 5. 心跳超时：s1 的 lastHeartbeat 是 s1Heartbeat，now 是 s1Heartbeat+10000，超时
    //    Coder/Analyst 的 lastHeartbeat 是 s1Heartbeat+10000，now 也是 s1Heartbeat+10000，未超时
    await monitor.check()

    // 6. 调度排除 offline Agent
    expect(() => scheduler.selectAgent('search')).toThrow(UnavailableError)
    expect(scheduler.selectAgent('code_generation')).toBeDefined()

    Date.now = originalNow

    // 7. 验证状态
    expect(hive.get(s1.agentId).status).toBe('offline')
    expect(hive.size).toBe(3)
  })
})
