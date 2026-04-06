/**
 * Aggregator — 结果聚合
 *
 * 纯函数，将 TaskRecord 中各步骤的 StepResult 聚合为最终输出。
 */

/**
 * 聚合多个步骤的执行结果
 *
 * @param {import('../models/task.js').TaskRecord} task - 含 results 的任务记录
 * @returns {{
 *   status: 'success' | 'failure' | 'partial',
 *   output: any,
 *   summary: string,
 *   usage: { input_tokens: number, output_tokens: number, total_latency_ms: number },
 *   artifacts: any[]
 * }}
 */
export function merge(task) {
  const { results, strategy } = task

  // 无结果
  if (!results || results.length === 0) {
    return {
      status: 'failure',
      output: null,
      summary: 'No results',
      usage: { input_tokens: 0, output_tokens: 0, total_latency_ms: 0 },
      artifacts: []
    }
  }

  // 统计成功/失败
  const successes = results.filter(r => r.status === 'success')
  const failures = results.filter(r => r.status === 'failure')

  // 判定状态
  let status
  if (failures.length === 0) {
    status = 'success'
  } else if (successes.length === 0) {
    status = 'failure'
  } else {
    status = 'partial'
  }

  // 合并 output
  let output
  if (strategy === 'serial') {
    // serial：取最后一步的 output
    const lastSuccess = [...results].reverse().find(r => r.status === 'success')
    output = lastSuccess?.output ?? null
  } else if (strategy === 'parallel') {
    // parallel：收集所有成功步骤的 output 为数组
    output = successes.map(r => r.output)
  } else {
    // single
    output = results[0]?.output ?? null
  }

  // 生成 summary
  const summary = results
    .filter(r => r.summary)
    .map(r => r.summary)
    .join('; ') || `Completed ${results.length} step(s)`

  // 累加 usage
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    total_latency_ms: task.startedAt != null && task.finishedAt != null
      ? task.finishedAt - task.startedAt
      : 0
  }
  for (const r of results) {
    if (r.usage) {
      usage.input_tokens += r.usage.input_tokens ?? 0
      usage.output_tokens += r.usage.output_tokens ?? 0
    }
  }

  // 收集 artifacts
  const artifacts = results.flatMap(r => r.artifacts ?? [])

  return { status, output, summary, usage, artifacts }
}
