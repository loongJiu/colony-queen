#!/usr/bin/env node

/**
 * Colony Queen SSE Stream Demo
 *
 * 连接 /admin/stream SSE 端点，实时展示 Queen 的事件流。
 * 可配合 demo.mjs 使用，观察 agent 和 task 的状态变化。
 *
 * 用法：
 *   node demo-stream.mjs                  # 持续监听所有事件
 *   node demo-stream.mjs --filter <type>  # 只显示指定类型事件（agent.updated, task.updated, task.log）
 *   node demo-stream.mjs --count <n>      # 收到 n 个事件后退出
 *   node demo-stream.mjs --snapshot       # 只打印初始快照然后退出
 */

// ─── 配置 ──────────────────────────────────────────
const QUEEN_URL = process.env.QUEEN_URL || 'http://127.0.0.1:9009'

// ─── 工具函数 ──────────────────────────────────────
function log (tag, msg) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const color = tag === 'SNAP' ? '\x1b[35m' : tag === 'EVENT' ? '\x1b[36m' : '\x1b[33m'
  console.log(`  ${ts}  ${color}${tag}\x1b[0m  ${msg}`)
}

function formatAgent (agent) {
  const statusColor = agent.status === 'idle' ? '\x1b[32m' : agent.status === 'busy' ? '\x1b[33m' : agent.status === 'error' ? '\x1b[31m' : '\x1b[90m'
  return `${agent.name || agent.agentId?.slice(-12)} ${statusColor}${agent.status}\x1b[0m load=${(agent.load ?? 0).toFixed(1)}`
}

function formatTask (task) {
  const statusColor = task.status === 'success' ? '\x1b[32m' : task.status === 'running' ? '\x1b[33m' : task.status === 'failure' ? '\x1b[31m' : '\x1b[36m'
  const desc = task.request?.description?.slice(0, 40) || task.taskId?.slice(-12)
  return `${task.taskId?.slice(-12)} ${statusColor}${task.status}\x1b[0m "${desc}"`
}

// ─── 入口 ──────────────────────────────────────────
async function main () {
  const args = process.argv.slice(2)

  const filterIdx = args.indexOf('--filter')
  const filterType = filterIdx !== -1 && args[filterIdx + 1] ? args[filterIdx + 1] : null

  const countIdx = args.indexOf('--count')
  const maxCount = countIdx !== -1 && args[countIdx + 1] ? parseInt(args[countIdx + 1], 10) : Infinity

  const doSnapshot = args.includes('--snapshot')

  console.log()
  console.log('\x1b[33m  Colony Queen SSE Stream\x1b[0m')
  console.log(`  Target: ${QUEEN_URL}/admin/stream`)
  if (filterType) console.log(`  Filter: ${filterType}`)
  if (maxCount !== Infinity) console.log(`  Max events: ${maxCount}`)
  console.log()

  let eventCount = 0

  const res = await fetch(`${QUEEN_URL}/admin/stream`, {
    headers: { Accept: 'text/event-stream' }
  })

  if (!res.ok) {
    log('ERROR', `Connection failed: ${res.status}`)
    process.exit(1)
  }

  log('OK', 'SSE connected, listening for events...')
  console.log()

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      log('WARN', 'SSE connection closed by server')
      break
    }

    buffer += decoder.decode(value, { stream: true })

    // Parse SSE messages
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let currentEvent = null
    let currentData = null

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6)
      } else if (line === '' && currentData) {
        // End of SSE message
        try {
          const parsed = JSON.parse(currentData)

          if (currentEvent === 'snapshot') {
            const agents = parsed.agents || []
            const tasks = parsed.tasks || []
            const agentStats = parsed.agentStats || {}
            const taskStats = parsed.taskStats || {}

            log('SNAP', `Initial snapshot:`)
            log('SNAP', `  Agents (${agents.length}): ${Object.entries(agentStats).map(([k, v]) => `${k}=${v}`).join(', ')}`)
            for (const a of agents) {
              log('SNAP', `    ${formatAgent(a)}`)
            }
            log('SNAP', `  Tasks (${tasks.length}): ${Object.entries(taskStats).map(([k, v]) => `${k}=${v}`).join(', ')}`)
            for (const t of tasks) {
              log('SNAP', `    ${formatTask(t)}`)
            }

            if (doSnapshot) {
              console.log()
              process.exit(0)
            }
          } else if (currentEvent === 'agent.updated') {
            if (filterType && currentEvent !== filterType) continue
            eventCount++
            const agent = parsed
            log('EVENT', `agent.updated → ${formatAgent(agent)}`)
          } else if (currentEvent === 'task.updated') {
            if (filterType && currentEvent !== filterType) continue
            eventCount++
            log('EVENT', `task.updated → ${formatTask(parsed)}`)
          } else if (currentEvent === 'task.log') {
            if (filterType && currentEvent !== filterType) continue
            eventCount++
            const level = parsed.level || 'info'
            const msg = parsed.message || JSON.stringify(parsed).slice(0, 80)
            log('LOG', `[${level}] ${msg}`)
          } else if (currentEvent) {
            if (filterType && currentEvent !== filterType) continue
            eventCount++
            log('EVENT', `${currentEvent} → ${JSON.stringify(parsed).slice(0, 100)}`)
          }
        } catch {
          // ignore non-JSON data (e.g. keep-alive comments)
        }

        currentEvent = null
        currentData = null

        if (eventCount >= maxCount) {
          console.log()
          log('OK', `Reached ${maxCount} events, exiting`)
          process.exit(0)
        }
      }
    }
  }
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
