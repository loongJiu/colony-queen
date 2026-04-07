#!/usr/bin/env node

/**
 * Colony Queen Demo Script
 *
 * 模拟 Worker Agent 注册、心跳上报和任务执行，
 * 每个 Agent 启动一个 mock HTTP server 响应 Queen 的任务调度。
 *
 * 用法：
 *   node demo.mjs              # 注册 4 个 Agent + 持续心跳（含 mock server）
 *   node demo.mjs --task       # 额外提交一个测试任务
 *   node demo.mjs --chaos      # 随机切换 Agent 状态/负载
 *   node demo.mjs --leave      # 随机让一个 Agent 优雅离线再回来
 *   node demo.mjs --update     # 周期性更新 Agent spec（测试 /colony/update）
 *   node demo.mjs --clean      # 清理所有 Agent 后退出
 *   以上参数可组合使用，如: node demo.mjs --task --chaos
 */

import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'

// ─── 配置 ──────────────────────────────────────────
const QUEEN_URL = process.env.QUEEN_URL || 'http://127.0.0.1:9009'
const COLONY_TOKEN = process.env.COLONY_TOKEN || 'change-me-in-production'
const HEARTBEAT_INTERVAL_MS = 5000
const MOCK_TASK_DELAY_MS = 800 // mock agent 处理任务延迟

// 模拟 Agent 池（每个固定端口，便于 mock server 监听）
const AGENT_SPECS = [
  {
    name: 'scout_web_01',
    role: 'scout',
    capabilities: ['search', 'data_collection'],
    model: 'glm-4',
    tools: ['http_client', 'web_scraper'],
    port: 4100
  },
  {
    name: 'worker_coder_01',
    role: 'worker',
    capabilities: ['code_generation', 'debugging'],
    model: 'claude-sonnet-4-6',
    tools: ['code_executor', 'github_api'],
    port: 4101
  },
  {
    name: 'worker_analyst_01',
    role: 'worker',
    capabilities: ['data_analysis', 'visualization'],
    model: 'glm-4',
    tools: ['pandas', 'matplotlib'],
    port: 4102
  },
  {
    name: 'worker_writer_01',
    role: 'worker',
    capabilities: ['text_writing', 'translation'],
    model: 'glm-4',
    tools: ['text_editor'],
    port: 4103
  }
]

// ─── 工具函数 ──────────────────────────────────────
function sha256 (str) {
  return createHash('sha256').update(str).digest('hex')
}

function hmacSha256 (data, key) {
  return createHmac('sha256', key).update(data).digest('hex')
}

function log (tag, msg) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const color = tag === 'ERROR' ? '\x1b[31m' : tag === 'OK' ? '\x1b[32m' : tag === 'WARN' ? '\x1b[33m' : '\x1b[36m'
  console.log(`  ${ts}  ${color}${tag}\x1b[0m  ${msg}`)
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function apiFetch (method, path, body) {
  const res = await fetch(`${QUEEN_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(data)}`)
  }
  return data
}

// ─── Mock Agent HTTP Server ─────────────────────────
// 每个 Agent 启动一个小型 HTTP server，响应 Queen 的任务调度请求：
//   POST /bee/task   → 模拟执行后返回结果
//   POST /bee/cancel → 返回取消确认

function startMockAgentServer (spec) {
  const cancelledTasks = new Set()

  const server = createServer((req, res) => {
    // CORS / preflight
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    if (req.method === 'POST' && req.url === '/bee/task') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        let payload = {}
        try { payload = JSON.parse(body) } catch { /* ignore */ }

        const taskId = payload.task?.task_id || 'unknown'
        const taskName = payload.task?.name || payload.task?.description || 'unknown task'

        log('RECV', `${spec.name} got task: ${taskName}`)

        // 模拟异步执行
        const delay = MOCK_TASK_DELAY_MS + Math.random() * 400
        const timer = setTimeout(() => {
          if (cancelledTasks.has(taskId)) {
            cancelledTasks.delete(taskId)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
              status: 'cancelled',
              output: null,
              summary: 'Task was cancelled'
            }))
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            status: 'success',
            output: {
              result: `[${spec.name}] Mock execution completed`,
              capability: spec.capabilities[0],
              agent: spec.name
            },
            summary: `${spec.name} 完成了「${taskName}」`,
            usage: {
              input_tokens: 50 + Math.floor(Math.random() * 100),
              output_tokens: 100 + Math.floor(Math.random() * 200),
              latency_ms: Math.round(delay)
            }
          }))
        }, delay)

        // 如果中途被取消（客户端断开连接触发，非流关闭）
        res.on('close', () => {
          if (!res.headersSent) {
            clearTimeout(timer)
          }
        })
      })
      return
    }

    if (req.method === 'POST' && req.url === '/bee/cancel') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        let payload = {}
        try { payload = JSON.parse(body) } catch { /* ignore */ }
        if (payload.task_id) cancelledTasks.add(payload.task_id)
        log('RECV', `${spec.name} cancel request for ${payload.task_id || 'unknown'}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'cancelled' }))
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  return new Promise((resolve, reject) => {
    server.listen(spec.port, '127.0.0.1', () => {
      resolve(server)
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log('WARN', `Port ${spec.port} in use, trying ${spec.port + 100}`)
        server.listen(spec.port + 100, () => resolve(server))
      } else {
        reject(err)
      }
    })
  })
}

// ─── 握手流程 ──────────────────────────────────────
async function registerAgent (spec) {
  const timestamp = new Date().toISOString()
  const signature = sha256(timestamp + COLONY_TOKEN)
  const endpoint = `http://127.0.0.1:${spec.server.address().port}`

  // Step 1: join
  const challenge = await apiFetch('POST', '/colony/join', {
    spec: {
      identity: { role: spec.role, name: spec.name },
      runtime: { endpoint },
      capabilities: spec.capabilities,
      model: { name: spec.model },
      tools: spec.tools.map(t => ({ id: t })),
      skills: []
    },
    timestamp,
    signature
  })

  // Step 2: verify
  const signedNonce = hmacSha256(challenge.nonce, COLONY_TOKEN)
  const welcome = await apiFetch('POST', '/colony/verify', {
    nonce: challenge.nonce,
    signed_nonce: signedNonce
  })

  return {
    agentId: welcome.agent_id,
    sessionToken: welcome.session_token,
    ...spec
  }
}

// ─── 心跳 ──────────────────────────────────────────
async function sendHeartbeat (agent, overrides = {}) {
  return apiFetch('POST', '/colony/heartbeat', {
    session_token: agent.sessionToken,
    status: overrides.status ?? agent.status ?? 'idle',
    load: overrides.load ?? agent.load ?? 0,
    active_tasks: overrides.activeTasks ?? agent.activeTasks ?? 0,
    queue_depth: overrides.queueDepth ?? agent.queueDepth ?? 0
  })
}

// ─── 主逻辑 ─────────────────────────────────────────
async function main () {
  const args = process.argv.slice(2)
  const doTask = args.includes('--task')
  const doChaos = args.includes('--chaos')
  const doClean = args.includes('--clean')
  const doLeave = args.includes('--leave')
  const doUpdate = args.includes('--update')

  console.log()
  console.log('\x1b[33m  Colony Queen Demo\x1b[0m')
  console.log(`  Target: ${QUEEN_URL}`)
  const modes = []
  if (doClean) modes.push('clean')
  if (doChaos) modes.push('chaos')
  if (doLeave) modes.push('leave')
  if (doUpdate) modes.push('update')
  if (doTask) modes.push('task')
  if (modes.length === 0) modes.push('normal')
  console.log(`  Mode:   ${modes.join(' + ')}`)
  console.log()

  // Health check
  try {
    const health = await apiFetch('GET', '/health', null)
    log('OK', `Queen is alive — ${new Date(health.timestamp).toLocaleTimeString()}`)
  } catch (e) {
    log('ERROR', `Queen unreachable at ${QUEEN_URL}: ${e.message}`)
    process.exit(1)
  }

  // ── Clean mode: force remove all agents ──
  if (doClean) {
    const { agents } = await apiFetch('GET', '/admin/agents', null)
    for (const agent of agents) {
      await apiFetch('DELETE', `/admin/agents/${agent.agentId}`, null)
      log('OK', `Removed ${agent.name || agent.agentId}`)
    }
    log('OK', `Cleaned ${agents.length} agents`)
    process.exit(0)
  }

  // ── Start mock servers + register agents ──
  const servers = []
  const agents = []

  for (const spec of AGENT_SPECS) {
    try {
      // 启动 mock HTTP server
      const server = await startMockAgentServer(spec)
      servers.push(server)
      spec.server = server

      // 注册到 Queen
      const agent = await registerAgent(spec)
      agents.push(agent)
      log('OK', `Registered \x1b[1m${spec.name}\x1b[0m [${spec.capabilities.join(', ')}] :${server.address().port}`)
    } catch (e) {
      log('ERROR', `Failed ${spec.name}: ${e.message}`)
    }
  }

  if (agents.length === 0) {
    log('ERROR', 'No agents registered, exiting')
    process.exit(1)
  }

  console.log()
  log('INFO', `${agents.length} agents online — mock servers ready for task execution`)
  console.log()

  // ── Submit task if requested ──
  if (doTask) {
    try {
      const task = await apiFetch('POST', '/task', {
        description: '搜索竞品数据并分析'
      })
      log('OK', `Task created: \x1b[1m${task.task_id}\x1b[0m (strategy: ${task.strategy})`)
      for (const step of task.steps) {
        log('INFO', `  Step ${step.step_index}: ${step.capability} — ${step.description}`)
      }
    } catch (e) {
      log('ERROR', `Task failed: ${e.message}`)
    }
    console.log()
  }

  // ── Heartbeat loop ──
  log('INFO', 'Sending heartbeats every 5s (Ctrl+C to stop)')
  console.log()

  let heartbeatCount = 0
  let leaveInProgress = false

  const interval = setInterval(async () => {
    heartbeatCount++

    for (const agent of agents) {
      let overrides = {}

      if (doChaos) {
        // 随机状态变化
        const roll = Math.random()
        if (roll < 0.25) {
          overrides = { status: 'busy', load: 40 + Math.random() * 60, activeTasks: Math.floor(Math.random() * 4) + 1, queueDepth: Math.floor(Math.random() * 3) }
        } else if (roll < 0.35) {
          overrides = { status: 'error', load: 0, activeTasks: 0 }
        } else {
          overrides = { status: 'idle', load: Math.random() * 20, activeTasks: 0, queueDepth: 0 }
        }
        agent.status = overrides.status
        agent.load = overrides.load
        agent.activeTasks = overrides.activeTasks
        agent.queueDepth = overrides.queueDepth
      } else {
        // 正常模式：轻微负载波动
        overrides = {
          load: Math.random() * 15,
          activeTasks: 0,
          queueDepth: 0
        }
      }

      try {
        await sendHeartbeat(agent, overrides)
      } catch (e) {
        if (e.message.includes('401')) {
          log('WARN', `${agent.name} session expired, re-registering...`)
          try {
            const newAgent = await registerAgent(agent)
            Object.assign(agent, newAgent)
            log('OK', `Re-registered ${agent.name}`)
          } catch (re) {
            log('ERROR', `Re-registration failed for ${agent.name}: ${re.message}`)
          }
        }
      }
    }

    // --update 模式：周期性更新 agent spec
    if (doUpdate && heartbeatCount > 0 && heartbeatCount % 8 === 0) {
      const target = agents[Math.floor(Math.random() * agents.length)]
      const newCapabilities = ['search', 'data_collection', 'code_generation', 'debugging', 'data_analysis', 'visualization', 'text_writing', 'translation']
      const shuffled = newCapabilities.sort(() => Math.random() - 0.5)
      const randomCaps = shuffled.slice(0, 3 + Math.floor(Math.random() * 3))

      try {
        const res = await apiFetch('POST', '/colony/update', {
          session_token: target.sessionToken,
          patch: {
            capabilities: randomCaps
          }
        })
        log('OK', `${target.name} updated capabilities → [${randomCaps.join(', ')}]`)
      } catch (e) {
        log('ERROR', `Update failed for ${target.name}: ${e.message}`)
      }
    }

    // --leave 模式：周期性让一个 agent 优雅离线再回来
    if (doLeave && !leaveInProgress && heartbeatCount > 0 && heartbeatCount % 12 === 0) {
      leaveInProgress = true
      const victim = agents[Math.floor(Math.random() * agents.length)]
      log('WARN', `${victim.name} is leaving gracefully...`)

      try {
        await apiFetch('POST', '/colony/leave', { session_token: victim.sessionToken })
        log('OK', `${victim.name} left`)

        // 等一会在重新注册
        await sleep(8000)
        const newAgent = await registerAgent(victim)
        Object.assign(victim, newAgent)
        log('OK', `${victim.name} rejoined with new session`)
      } catch (e) {
        log('ERROR', `Leave/rejoin failed for ${victim.name}: ${e.message}`)
      }
      leaveInProgress = false
    }

    if (heartbeatCount % 6 === 0) {
      const stats = agents.map(a => `${a.name}=${a.status}`).join(' ')
      log('INFO', `Heartbeat #${heartbeatCount} — ${stats}`)
    }
  }, HEARTBEAT_INTERVAL_MS)

  // Graceful shutdown
  const shutdown = async () => {
    console.log()
    log('INFO', 'Shutting down...')
    clearInterval(interval)

    for (const agent of agents) {
      try {
        await apiFetch('POST', '/colony/leave', { session_token: agent.sessionToken })
        log('OK', `${agent.name} left`)
      } catch (e) {
        // 可能已经离线
      }
    }

    for (const server of servers) {
      server.close()
    }

    log('OK', 'All agents disconnected, servers stopped')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  log('ERROR', e.message)
  process.exit(1)
})
