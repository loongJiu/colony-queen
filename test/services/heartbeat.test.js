import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hive } from '../../src/core/hive.js'
import { Waggle } from '../../src/core/waggle.js'
import { HeartbeatMonitor } from '../../src/services/heartbeat.js'

function makeSpec(overrides = {}) {
  return {
    identity: { role: 'worker', name: 'Test', ...overrides.identity },
    runtime: { endpoint: 'http://localhost:4001' },
    capabilities: overrides.capabilities ?? ['test'],
    model: {},
    tools: [],
    skills: []
  }
}

function setup() {
  const hive = new Hive()
  const waggle = new Waggle()
  const monitor = new HeartbeatMonitor({ hive, waggle, intervalMs: 100, timeoutMs: 5000 })
  return { hive, waggle, monitor }
}

describe('HeartbeatMonitor', () => {
  // ── check ───────────────────────────────────

  describe('check', () => {
    it('returns empty array when all agents have recent heartbeats', async () => {
      const { monitor } = setup()
      expect(await monitor.check()).toEqual([])
    })

    it('returns empty array when no agents registered', async () => {
      const { monitor } = setup()
      expect(await monitor.check()).toEqual([])
    })

    it('marks agent offline when heartbeat exceeds timeout', async () => {
      const { hive, monitor } = setup()
      const agent = hive.register(makeSpec(), 'sess_1')

      // 模拟心跳超时：将 lastHeartbeat 设为过去
      hive.updateHeartbeat(agent.agentId, { load: 0 })
      // 直接操作：用 updateHeartbeat 内部会刷新 lastHeartbeat，
      // 所以我们需要 mock Date.now
      const originalNow = Date.now
      const fakeNow = agent.lastHeartbeat + 10000 // 超过 timeoutMs(5000)
      Date.now = () => fakeNow

      const result = await monitor.check()

      Date.now = originalNow

      expect(result).toContain(agent.agentId)
      expect(hive.get(agent.agentId).status).toBe('offline')
    })

    it('does not mark agent offline within timeout', async () => {
      const { hive, monitor } = setup()
      const agent = hive.register(makeSpec(), 'sess_1')

      const result = await monitor.check()

      expect(result).toEqual([])
      expect(hive.get(agent.agentId).status).toBe('idle')
    })

    it('skips already offline agents', async () => {
      const { hive, monitor } = setup()
      const agent = hive.register(makeSpec(), 'sess_1')
      hive.markOffline(agent.agentId)

      const originalNow = Date.now
      Date.now = () => hive.get(agent.agentId).lastHeartbeat + 10000

      const result = await monitor.check()

      Date.now = originalNow

      expect(result).toEqual([])
    })

    it('skips unregistered agents', async () => {
      const { hive, monitor } = setup()
      const agent = hive.register(makeSpec(), 'sess_1')
      const agentId = agent.agentId

      // 先让心跳看起来超时
      const originalNow = Date.now
      Date.now = () => agent.lastHeartbeat + 10000

      // 在 check 之前注销
      hive.unregister(agentId)

      const result = await monitor.check()

      Date.now = originalNow

      expect(result).toEqual([])
    })

    it('handles multiple agents timing out', async () => {
      const { hive, monitor } = setup()
      const a = hive.register(makeSpec({ identity: { name: 'A' } }), 'sess_1')
      const b = hive.register(makeSpec({ identity: { name: 'B' } }), 'sess_2')

      const originalNow = Date.now
      Date.now = () => a.lastHeartbeat + 10000

      const result = await monitor.check()

      Date.now = originalNow

      expect(result).toHaveLength(2)
      expect(result).toContain(a.agentId)
      expect(result).toContain(b.agentId)
    })

    it('only marks timed-out agents, not healthy ones', async () => {
      const { hive, monitor } = setup()
      const stale = hive.register(makeSpec({ identity: { name: 'Stale' } }), 'sess_1')

      const originalNow = Date.now
      // 让 stale 的心跳看起来超时
      Date.now = () => stale.lastHeartbeat + 10000

      // 在"超时"时刻注册 healthy，它的 lastHeartbeat 就是当前 mock 时间
      const healthy = hive.register(makeSpec({ identity: { name: 'Healthy' } }), 'sess_2')

      const result = await monitor.check()

      Date.now = originalNow

      expect(result).toEqual([stale.agentId])
      expect(hive.get(healthy.agentId).status).toBe('idle')
      expect(hive.get(stale.agentId).status).toBe('offline')
    })
  })

  // ── broadcast on offline ────────────────────

  describe('broadcast on offline', () => {
    it('broadcasts agent.offline event via waggle', async () => {
      const { hive, waggle, monitor } = setup()
      const agent = hive.register(makeSpec(), 'sess_1')

      const received = []
      waggle.subscribe('queen', (msg) => received.push(msg))

      const originalNow = Date.now
      Date.now = () => agent.lastHeartbeat + 10000

      await monitor.check()

      Date.now = originalNow

      // 广播消息会投递给所有订阅者（包括 queen）
      const offlineEvent = received.find(m => m.payload?.event === 'agent.offline')
      expect(offlineEvent).toBeDefined()
      expect(offlineEvent.payload.agentId).toBe(agent.agentId)
      expect(offlineEvent.type).toBe('event')
      expect(offlineEvent.priority).toBe(2)
    })
  })

  // ── start/stop ──────────────────────────────

  describe('start/stop', () => {
    it('start does not crash', () => {
      const { monitor } = setup()
      monitor.start()
      monitor.stop()
    })

    it('stop is idempotent', () => {
      const { monitor } = setup()
      monitor.stop()
      monitor.stop()
    })

    it('start is idempotent', () => {
      const { monitor } = setup()
      monitor.start()
      monitor.start()
      monitor.stop()
    })

    it('periodically calls check', () => {
      vi.useFakeTimers()
      const { monitor } = setup()
      const spy = vi.spyOn(monitor, 'check')

      monitor.start()

      vi.advanceTimersByTime(350)

      expect(spy).toHaveBeenCalledTimes(3)

      monitor.stop()
      vi.useRealTimers()
    })

    it('stops calling check after stop', () => {
      vi.useFakeTimers()
      const { monitor } = setup()
      const spy = vi.spyOn(monitor, 'check')

      monitor.start()
      vi.advanceTimersByTime(150)
      monitor.stop()
      const count = spy.mock.calls.length

      vi.advanceTimersByTime(500)
      expect(spy.mock.calls.length).toBe(count)

      vi.useRealTimers()
    })
  })
})
