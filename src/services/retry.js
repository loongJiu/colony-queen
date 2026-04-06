/**
 * RetryService — 重试服务
 *
 * 封装重试逻辑，为 Executor 提供带指数退避的重试能力。
 * 处理临时性故障（网络超时、Agent 过载等），自动重试可恢复的错误。
 */

import config from '../config.js'

/**
 * @typedef {import('./executor.js').StepResult} StepResult
 */

export class RetryService {
  /** @type {number} 上次重试时间戳 */
  #lastRetryTime = 0

  /**
   * 执行带重试的操作
   *
   * @param {Object} options
   * @param {Function} options.fn - 异步操作函数，返回 StepResult
   * @param {StepResult|undefined} options.lastResult - 上次执行结果（失败时）
   * @param {number} options.retryCount - 当前重试次数（从 0 开始）
   * @param {string[]} options.excludeAgentIds - 排除的 Agent ID（已失败的）
   * @param {Object} options.logger - Pino logger
   * @returns {Promise<{ result: StepResult, shouldRetry: boolean, error?: Error }>}
   */
  async executeWithRetry({ fn, lastResult, retryCount, excludeAgentIds = [], logger }) {
    // 检查是否已达到最大重试次数
    if (retryCount >= config.SCHEDULER_MAX_RETRY) {
      logger.debug({ retryCount, maxRetry: config.SCHEDULER_MAX_RETRY }, 'Max retry count reached')
      return {
        result: lastResult || { status: 'failure', error: { code: 'ERR_MAX_RETRY', message: 'Max retry count reached', retryable: false } },
        shouldRetry: false
      }
    }

    // 检查上次结果是否可重试
    if (lastResult && lastResult.error && !this.#isRetryable(lastResult.error)) {
      logger.debug({ errorCode: lastResult.error.code }, 'Error is not retryable')
      return { result: lastResult, shouldRetry: false }
    }

    // 确保重试间隔
    await this.#ensureMinRetryInterval(retryCount, logger)

    try {
      const result = await fn(excludeAgentIds)

      // 成功则返回
      if (result.status === 'success') {
        logger.debug({ retryCount }, 'Retry succeeded')
        return { result, shouldRetry: false }
      }

      // 失败则检查是否继续重试
      if (result.error && this.#isRetryable(result.error)) {
        logger.debug({ retryCount, errorCode: result.error.code }, 'Retry failed, will retry again')
        return { result, shouldRetry: true }
      }

      // 不可重试的错误
      return { result, shouldRetry: false }

    } catch (err) {
      // 捕获未预期的异常
      logger.error({ err, retryCount }, 'Unexpected error in retry')
      return {
        result: { status: 'failure', error: { code: 'ERR_UNKNOWN', message: err.message, retryable: true } },
        shouldRetry: this.#isRetryable(err)
      }
    }
  }

  /**
   * 计算指数退避延迟
   *
   * @param {number} retryCount - 重试次数
   * @returns {number} 延迟毫秒数
   */
  #calculateBackoff(retryCount) {
    const baseDelay = config.SCHEDULER_RETRY_BASE_DELAY_MS
    const maxDelay = config.SCHEDULER_RETRY_MAX_DELAY_MS
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
  }

  /**
   * 判断错误是否可重试
   *
   * @param {Error|Object} error - 错误对象（可能是 Error 实例或 StepResult.error）
   * @returns {boolean}
   */
  #isRetryable(error) {
    // 优先检查 retryable 字段
    if (typeof error === 'object' && error !== null) {
      if ('retryable' in error) {
        return error.retryable === true
      }
      if ('code' in error) {
        // 根据错误码判断
        const retryableCodes = ['ERR_TIMEOUT', 'ERR_UNAVAILABLE', 'ERR_NO_AGENT', 'ERR_AGENT_OVERLOADED']
        return retryableCodes.includes(error.code)
      }
    }
    return false
  }

  /**
   * 确保重试间隔不低于配置的最小值
   * 使用指数退避算法，防止重试风暴
   *
   * @param {number} retryCount - 重试次数
   * @param {Object} logger - Pino logger
   * @returns {Promise<void>}
   */
  async #ensureMinRetryInterval(retryCount, logger) {
    const now = Date.now()
    const backoff = this.#calculateBackoff(retryCount)

    if (this.#lastRetryTime > 0) {
      const elapsed = now - this.#lastRetryTime
      const waitTime = Math.max(0, backoff - elapsed)

      if (waitTime > 0) {
        logger.debug({ retryCount, backoff, elapsed, waitTime }, 'Waiting before retry')
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    this.#lastRetryTime = Date.now()
  }
}
