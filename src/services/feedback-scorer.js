/**
 * FeedbackScorer — 反馈自动评分算法
 *
 * 根据任务执行结果自动计算评分，用于任务完成后的即时反馈生成。
 * 评分维度：执行状态、重试次数、置信度、输出完整性、执行耗时。
 */

export class FeedbackScorer {
  /**
   * 计算自动评分
   *
   * 评分规则：
   * - 基础分 1.0
   * - failure: -0.6
   * - retryCount * 0.1 扣分
   * - low_confidence (confidence < 0.5): -0.15
   * - partial_output (status === 'partial'): -0.2
   * - used_fallback: -0.1
   * - durationRatio < 0.3 (执行时间远低于超时): +0.05
   * - confidence 权重 30% 混入（先 clamp 扣分后的分数，再混入 confidence）
   * - 最终 clamp 到 [0, 1]
   *
   * @param {import('../models/task.js').TaskRecord} task
   * @param {Object} [executionMeta]
   * @param {boolean} [executionMeta.usedFallback] - 是否使用了 fallback Agent
   * @param {number} [executionMeta.timeoutMs] - 任务超时时间(ms)
   * @returns {number} 自动评分 0.0-1.0
   */
  compute(task, executionMeta = {}) {
    let score = 1.0

    // 执行状态扣分
    if (task.status === 'failure') {
      score -= 0.6
    } else if (task.status === 'partial') {
      score -= 0.2
    }

    // 重试扣分
    const totalRetries = (task.results ?? []).reduce((sum, r) => {
      return sum + (r.retryCount ?? 0)
    }, 0)
    score -= totalRetries * 0.1

    // 置信度扣分
    const avgConfidence = this.#computeAvgConfidence(task.results ?? [])
    if (avgConfidence > 0 && avgConfidence < 0.5) {
      score -= 0.15
    }

    // 使用 fallback 扣分
    if (executionMeta.usedFallback) {
      score -= 0.1
    }

    // 执行耗时加分：如果实际耗时远低于超时阈值
    if (executionMeta.timeoutMs && task.startedAt && task.finishedAt) {
      const duration = task.finishedAt - task.startedAt
      const ratio = duration / executionMeta.timeoutMs
      if (ratio < 0.3) {
        score += 0.05
      }
    }

    // 先 clamp 到 [0, 1] 再进行 confidence 权重混入，避免负数被放大
    score = Math.max(0, Math.min(1, score))

    // confidence 权重 30% 混入：用 Agent 自评置信度调整评分
    // Agent 返回的 output 对象可包含 confidence 字段（0.0-1.0）
    if (avgConfidence > 0) {
      score = score * 0.7 + avgConfidence * 0.3
    }

    // 最终 clamp 到 [0, 1]
    return Math.max(0, Math.min(1, score))
  }

  /**
   * 归一化用户评分（1-5 → 0-1）
   *
   * @param {number} userScore - 用户评分 1-5
   * @returns {number} 归一化后的评分 0.0-1.0
   */
  normalizeUserScore(userScore) {
    return (userScore - 1) / 4
  }

  /**
   * 计算综合评分
   *
   * 权重：自动评分 30% + 用户评分 70%
   * 无用户评分时直接返回自动评分。
   *
   * @param {number} autoScore - 自动评分 0.0-1.0
   * @param {number|null} [userScore] - 用户评分 1-5，null 表示未提供
   * @returns {number} 综合评分 0.0-1.0
   */
  final(autoScore, userScore) {
    if (userScore == null) {
      return autoScore
    }
    const normalized = this.normalizeUserScore(userScore)
    return Math.max(0, Math.min(1, autoScore * 0.3 + normalized * 0.7))
  }

  /**
   * 计算结果列表的平均置信度
   *
   * 从 Agent 返回的 output 或 usage 中提取 confidence 字段。
   * Agent 可在返回结果中包含 confidence（0.0-1.0）用于自评执行质量。
   * 当前 StepResult 模型中 output 为任意类型，Agent 可自由附加此字段。
   * 若 Agent 未提供 confidence，返回 0 表示不可用。
   *
   * @param {import('../models/task.js').StepResult[]} results
   * @returns {number} 0.0-1.0，无可用数据时返回 0
   */
  #computeAvgConfidence(results) {
    const confidences = results
      .map(r => {
        // output 可能是任意对象，从中提取 confidence
        if (r.output && typeof r.output === 'object' && typeof r.output.confidence === 'number') {
          return r.output.confidence
        }
        // usage 中也可能携带 confidence（部分 Agent 习惯放在这里）
        if (r.usage && typeof r.usage.confidence === 'number') {
          return r.usage.confidence
        }
        return null
      })
      .filter(c => c !== null)
      // Agent 可能返回越界的 confidence 值，clamp 到 [0, 1]
      .map(c => Math.max(0, Math.min(1, c)))

    if (confidences.length === 0) return 0
    return confidences.reduce((a, b) => a + b, 0) / confidences.length
  }
}
