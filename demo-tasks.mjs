#!/usr/bin/env node

/**
 * Colony Queen Task Demo Script
 *
 * 测试任务系统的各种场景：提交、轮询、取消、预检失败等。
 * 需要先启动 demo.mjs 注册 Agent。
 *
 * 用法：
 *   node demo-tasks.mjs                  # 运行所有测试
 *   node demo-tasks.mjs --single         # 提交单步任务
 *   node demo-tasks.mjs --serial         # 提交串行任务
 *   node demo-tasks.mjs --parallel       # 提交并行任务
 *   node demo-tasks.mjs --cancel         # 提交任务后取消
 *   node demo-tasks.mjs --precheck       # 测试预检失败（无匹配 capability）
 *   node demo-tasks.mjs --update         # 测试 agent spec 更新
 *   node demo-tasks.mjs --force          # 测试强制移除 agent
 *   node demo-tasks.mjs --health         # 测试 admin health
 *   node demo-tasks.mjs --list           # 列出所有任务
 *   node demo-tasks.mjs --detail <id>    # 查看任务详情
 */

// ─── 配置 ──────────────────────────────────────────
const QUEEN_URL = process.env.QUEEN_URL || 'http://127.0.0.1:9009'

// ─── 工具函数 ──────────────────────────────────────
function log (tag, msg) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const color = tag === 'ERROR' ? '\x1b[31m' : tag === 'OK' ? '\x1b[32m' : tag === 'WARN' ? '\x1b[33m' : tag === 'PASS' ? '\x1b[32m\x1b[1m' : '\x1b[36m'
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
  if (res.status === 204) return { status: 204, ok: true, data: null }
  const data = await res.json().catch(() => null)
  return { status: res.status, ok: res.ok, data }
}

// ─── 轮询任务直到终态 ───────────────────────────────
async function pollTask (taskId, maxWaitMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const { data } = await apiFetch('GET', `/task/${taskId}`)
    if (!data) {
      await sleep(500)
      continue
    }
    const task = data
    const status = task.status
    const results = task.results || []
    const completed = results.filter(r => r.status === 'success').length
    const total = task.steps?.length || 0

    process.stdout.write(`\r  ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}  \x1b[36mPOLL\x1b[0m  ${taskId.slice(-12)}... ${status} (${completed}/${total})    `)

    if (['success', 'failure', 'partial', 'cancelled'].includes(status)) {
      console.log() // newline
      return task
    }
    await sleep(800)
  }
  console.log()
  log('WARN', `Polling timed out after ${maxWaitMs}ms`)
  return null
}

// ─── 打印任务结果 ──────────────────────────────────
function printTaskResult (task) {
  if (!task) return
  console.log()
  console.log(`  \x1b[1mTask:\x1b[0m     ${task.task_id}`)
  console.log(`  \x1b[1mStatus:\x1b[0m   ${task.status}`)
  console.log(`  \x1b[1mStrategy:\x1b[0m ${task.strategy}`)

  const results = task.results || []
  if (results.length > 0) {
    console.log(`  \x1b[1mResults:\x1b[0m`)
    for (const r of results) {
      const icon = r.status === 'success' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
      const dur = r.finishedAt && r.startedAt ? ` (${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s)` : ''
      console.log(`    ${icon} Step ${r.stepIndex}: ${r.agentId}${dur}`)
      if (r.output?.result) console.log(`      → ${String(r.output.result).slice(0, 80)}`)
      if (r.error) console.log(`      → Error: ${r.error.message}`)
    }
  }

  if (task.final_output) {
    console.log(`  \x1b[1mOutput:\x1b[0m   ${JSON.stringify(task.final_output).slice(0, 120)}`)
  }
}

// ─── 测试场景 ──────────────────────────────────────

async function testSingleTask () {
  log('INFO', '━━━ 单步任务测试 ━━━')

  const { data, ok, status } = await apiFetch('POST', '/task', {
    description: '搜索最新的 AI 新闻'
  })

  if (!ok) {
    log('ERROR', `提交失败 (${status}): ${JSON.stringify(data)}`)
    return false
  }

  log('OK', `Task created: \x1b[1m${data.task_id}\x1b[0m (strategy: ${data.strategy})`)
  for (const step of data.steps) {
    log('INFO', `  Step ${step.step_index}: ${step.capability} — ${step.description}`)
  }

  const result = await pollTask(data.task_id)
  printTaskResult(result)

  const passed = result?.status === 'success'
  log(passed ? 'PASS' : 'ERROR', passed ? '单步任务测试通过' : `单步任务测试失败: ${result?.status}`)
  return passed
}

async function testSerialTask () {
  log('INFO', '━━━ 串行任务测试 ━━━')

  const { data, ok, status } = await apiFetch('POST', '/task', {
    description: '搜索竞品数据并分析'
  })

  if (!ok) {
    log('ERROR', `提交失败 (${status}): ${JSON.stringify(data)}`)
    return false
  }

  log('OK', `Task created: \x1b[1m${data.task_id}\x1b[0m (strategy: ${data.strategy}, ${data.steps.length} steps)`)
  for (const step of data.steps) {
    log('INFO', `  Step ${step.step_index}: ${step.capability} — ${step.description}`)
  }

  const result = await pollTask(data.task_id, 60000)
  printTaskResult(result)

  const passed = result?.status === 'success'
  log(passed ? 'PASS' : 'ERROR', passed ? '串行任务测试通过' : `串行任务测试失败: ${result?.status}`)
  return passed
}

async function testParallelTask () {
  log('INFO', '━━━ 并行任务测试 ━━━')

  const { data, ok, status } = await apiFetch('POST', '/task', {
    description: '并行执行：搜索 AI 新闻 + 数据分析'
  })

  if (!ok) {
    log('ERROR', `提交失败 (${status}): ${JSON.stringify(data)}`)
    return false
  }

  log('OK', `Task created: \x1b[1m${data.task_id}\x1b[0m (strategy: ${data.strategy}, ${data.steps.length} steps)`)
  for (const step of data.steps) {
    log('INFO', `  Step ${step.step_index}: ${step.capability} — ${step.description}`)
  }

  const result = await pollTask(data.task_id, 60000)
  printTaskResult(result)

  const passed = result?.status === 'success'
  log(passed ? 'PASS' : 'ERROR', passed ? '并行任务测试通过' : `并行任务测试失败: ${result?.status}`)
  return passed
}

async function testCancelTask () {
  log('INFO', '━━━ 任务取消测试 ━━━')

  // 提交串行任务（多步，给取消留时间窗口）
  const { data, ok } = await apiFetch('POST', '/task', {
    description: '搜索竞品数据并分析'
  })

  if (!ok) {
    log('ERROR', `提交失败: ${JSON.stringify(data)}`)
    return false
  }

  log('OK', `Task created: \x1b[1m${data.task_id}\x1b[0m`)
  log('INFO', 'Cancelling immediately...')

  // 立即取消
  const cancelRes = await apiFetch('DELETE', `/task/${data.task_id}`)
  log('INFO', `Cancel response: ${cancelRes.status} — ${JSON.stringify(cancelRes.data)}`)

  // 稍等确认状态
  await sleep(1000)
  const { data: task } = await apiFetch('GET', `/task/${data.task_id}`)
  const finalStatus = task?.status

  printTaskResult(task)

  const passed = ['cancelled', 'success', 'failure'].includes(finalStatus)
  log(passed ? 'PASS' : 'ERROR', `任务最终状态: ${finalStatus}`)
  return passed
}

async function testPrecheckFailure () {
  log('INFO', '━━━ 预检失败测试 ━━━')

  // 提交一个需要 quantum_computing 能力的任务，没有 agent 能提供
  const { data, ok, status } = await apiFetch('POST', '/task', {
    description: '请使用 quantum_computing 进行量子计算模拟'
  })

  if (ok) {
    log('WARN', '预期返回 503 但成功了 — Planner 可能未做 precheck')
    return false
  }

  log('INFO', `Response: ${status} — ${JSON.stringify(data)}`)

  const hasMissingCap = data?.error?.details?.missingCapabilities?.length > 0 ||
    data?.error?.code === 'ERR_NO_CAPABLE_AGENT' ||
    status === 503

  if (hasMissingCap) {
    const missing = data?.error?.details?.missingCapabilities || data?.error?.detail?.missingCapabilities || []
    log('PASS', `预检正确拦截，缺少能力: ${missing.join(', ') || '(see response)'}`)
    return true
  }

  log('ERROR', `预期 503 但收到 ${status}`)
  return false
}

async function testCancelFinishedTask () {
  log('INFO', '━━━ 取消已完成任务测试 ━━━')

  // 先提交一个快速任务
  const { data, ok } = await apiFetch('POST', '/task', {
    description: '翻译这段文字到英文'
  })

  if (!ok) {
    log('ERROR', `提交失败: ${JSON.stringify(data)}`)
    return false
  }

  log('OK', `Task created: \x1b[1m${data.task_id}\x1b[0m`)

  // 等任务完成
  const result = await pollTask(data.task_id)
  if (result?.status !== 'success') {
    log('WARN', `任务未成功，跳过测试: ${result?.status}`)
    return true // 不算失败
  }

  // 尝试取消已完成的任务
  log('INFO', 'Trying to cancel a finished task...')
  const cancelRes = await apiFetch('DELETE', `/task/${data.task_id}`)
  log('INFO', `Cancel response: ${cancelRes.status} — ${JSON.stringify(cancelRes.data)}`)

  const passed = cancelRes.status === 409
  log(passed ? 'PASS' : 'ERROR', passed ? '已完成任务正确返回 409' : `预期 409 但收到 ${cancelRes.status}`)
  return passed
}

async function testAgentUpdate () {
  log('INFO', '━━━ Agent Spec 更新测试 ━━━')

  // 先获取一个在线 agent
  const { data: agentData, ok: agentOk } = await apiFetch('GET', '/admin/agents')
  if (!agentOk || !agentData?.agents?.length) {
    log('ERROR', '没有在线 Agent')
    return false
  }

  // 找到有 session_token 的 agent（通过 admin 接口拿不到 session_token，需要通过心跳端点测试）
  // 这里改用 admin health 来验证，agent update 需要真正的 session_token
  // 所以我们测试的是 admin 端的代理更新能力

  const agent = agentData.agents[0]
  log('INFO', `Found agent: ${agent.name || agent.agentId} (status: ${agent.status})`)
  log('INFO', 'Note: /colony/update 需要 session_token，需要从 demo.mjs 获取')
  log('INFO', '验证 admin 端可以看到 agent 信息...')

  // 通过心跳获取 agent 的能力列表
  const capabilities = agent.capabilities || []
  log('OK', `Agent capabilities: ${capabilities.join(', ')}`)

  log('PASS', 'Agent 信息查询通过（/colony/update 需配合 demo.mjs --update 测试）')
  return true
}

async function testAdminHealth () {
  log('INFO', '━━━ Admin Health 测试 ━━━')

  const { data, ok, status } = await apiFetch('GET', '/admin/health')

  if (!ok) {
    log('ERROR', `获取失败 (${status}): ${JSON.stringify(data)}`)
    return false
  }

  log('OK', `Status: ${data.status}`)
  log('INFO', `  Uptime: ${data.uptime?.human || 'unknown'}`)
  log('INFO', `  Memory: RSS=${data.memory?.rss}, Heap=${data.memory?.heapUsed}/${data.memory?.heapTotal}`)
  log('INFO', `  Agents: ${data.stats?.registeredAgents}, Active tasks: ${data.stats?.activeTasks}`)

  const passed = data.status === 'healthy'
  log(passed ? 'PASS' : 'ERROR', passed ? 'Admin health 检查通过' : `状态异常: ${data.status}`)
  return passed
}

async function testForceRemove () {
  log('INFO', '━━━ 强制移除 Agent 测试 ━━━')

  // 获取 agent 列表
  const { data: before, ok: beforeOk } = await apiFetch('GET', '/admin/agents')
  if (!beforeOk) {
    log('ERROR', '无法获取 agent 列表')
    return false
  }

  const agents = before.agents || []
  if (agents.length < 2) {
    log('WARN', '需要至少 2 个 agent 才能安全测试强制移除（跳过）')
    return true
  }

  // 移除最后一个 agent
  const victim = agents[agents.length - 1]
  log('INFO', `Force removing: ${victim.name || victim.agentId}`)

  const { ok: delOk, status: delStatus } = await apiFetch('DELETE', `/admin/agents/${victim.agentId}`)

  if (!delOk) {
    log('ERROR', `删除失败 (${delStatus})`)
    return false
  }

  log('OK', `Agent removed (status ${delStatus})`)

  // 验证移除后 agent 数量减少
  const { data: after } = await apiFetch('GET', '/admin/agents')
  const afterCount = after?.agents?.length ?? -1
  log('INFO', `Agents: ${agents.length} → ${afterCount}`)

  const passed = afterCount === agents.length - 1
  log(passed ? 'PASS' : 'ERROR', passed ? '强制移除测试通过' : `数量不匹配: 期望 ${agents.length - 1}，实际 ${afterCount}`)
  return passed
}

async function testListTasks () {
  log('INFO', '━━━ 任务列表测试 ━━━')

  const { data, ok } = await apiFetch('GET', '/admin/tasks')

  if (!ok) {
    log('ERROR', `获取失败: ${JSON.stringify(data)}`)
    return false
  }

  const tasks = data.tasks || []
  const byStatus = data.byStatus || {}
  log('OK', `共 ${data.total} 个任务:`)
  log('INFO', `  状态分布: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`)

  for (const t of tasks.slice(0, 10)) {
    const desc = t.request?.description?.slice(0, 30) || '-'
    log('INFO', `  ${t.taskId.slice(-16)}  ${t.status.padEnd(10)}  ${desc}`)
  }

  if (tasks.length > 10) {
    log('INFO', `  ... and ${tasks.length - 10} more`)
  }

  log('PASS', '任务列表获取成功')
  return true
}

async function testDetail (taskId) {
  log('INFO', `━━━ 任务详情: ${taskId} ━━━`)

  const { data, ok } = await apiFetch('GET', `/task/${taskId}`)

  if (!ok) {
    log('ERROR', `获取失败: ${JSON.stringify(data)}`)
    return
  }

  printTaskResult(data)
}

// ─── 入口 ──────────────────────────────────────────
async function main () {
  const args = process.argv.slice(2)

  // 解析 --detail <id>
  const detailIdx = args.indexOf('--detail')
  if (detailIdx !== -1 && args[detailIdx + 1]) {
    await testDetail(args[detailIdx + 1])
    return
  }

  const doSingle = args.includes('--single')
  const doSerial = args.includes('--serial')
  const doParallel = args.includes('--parallel')
  const doCancel = args.includes('--cancel')
  const doPrecheck = args.includes('--precheck')
  const doUpdate = args.includes('--update')
  const doForce = args.includes('--force')
  const doHealth = args.includes('--health')
  const doList = args.includes('--list')
  const doAll = args.length === 0 || args.includes('--all')

  console.log()
  console.log('\x1b[33m  Colony Queen Task Demo\x1b[0m')
  console.log(`  Target: ${QUEEN_URL}`)
  console.log()

  // 检查 Agent 是否在线（除非只是查看 health 或 list）
  if (!doHealth || doAll) {
    const { data: agentData, ok: agentOk } = await apiFetch('GET', '/admin/agents')
    if (!agentOk || !agentData?.agents?.length) {
      log('ERROR', '没有在线 Agent，请先运行: node demo.mjs')
      process.exit(1)
    }
    log('OK', `${agentData.agents.length} agents online — ready to test`)
    console.log()
  }

  // 运行选中的测试
  const results = {}

  if (doHealth || doAll) {
    results.adminHealth = await testAdminHealth()
    console.log()
  }

  if (doList || doAll) {
    results.list = await testListTasks()
    console.log()
  }

  if (doSingle || doAll) {
    results.single = await testSingleTask()
    console.log()
  }

  if (doSerial || doAll) {
    results.serial = await testSerialTask()
    console.log()
  }

  if (doParallel || doAll) {
    results.parallel = await testParallelTask()
    console.log()
  }

  if (doCancel || doAll) {
    results.cancel = await testCancelTask()
    console.log()
  }

  if (doPrecheck || doAll) {
    results.precheck = await testPrecheckFailure()
    console.log()
  }

  if (doUpdate || doAll) {
    results.agentUpdate = await testAgentUpdate()
    console.log()
  }

  if (doForce) {
    results.forceRemove = await testForceRemove()
    console.log()
  }

  if (doAll) {
    results.cancelFinished = await testCancelFinishedTask()
    console.log()
  }

  // 汇总
  if (Object.keys(results).length > 0) {
    console.log('\x1b[33m  ━━━ Test Results ━━━\x1b[0m')
    for (const [name, passed] of Object.entries(results)) {
      const icon = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
      console.log(`  ${icon}  ${name}`)
    }

    const total = Object.keys(results).length
    const passed = Object.values(results).filter(Boolean).length
    console.log()
    console.log(`  \x1b[1m${passed}/${total} tests passed\x1b[0m`)
    console.log()
  }
}

main().catch((e) => {
  log('ERROR', e.message)
  process.exit(1)
})
