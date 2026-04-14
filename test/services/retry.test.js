/**
 * RetryService 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetryService } from '../../src/services/retry.js'

describe('RetryService', () => {
  let retryService
  let mockLogger

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    retryService = new RetryService()
  })

  describe('retryable 判断', () => {
    it('根据 error.retryable=true 判断为可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_SOMETHING', message: 'Error', retryable: true }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(true)
    })

    it('根据 error.retryable=false 判断为不可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_SOMETHING', message: 'Error', retryable: false }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(false)
    })

    it('ERR_TIMEOUT 可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'Timeout' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(true)
    })

    it('ERR_UNAVAILABLE 可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_UNAVAILABLE', message: 'Unavailable' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(true)
    })

    it('ERR_NO_AGENT 可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_NO_AGENT', message: 'No agent' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(true)
    })

    it('ERR_AGENT_OVERLOADED 可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_AGENT_OVERLOADED', message: 'Overloaded' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(true)
    })

    it('ERR_VALIDATION 不可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_VALIDATION', message: 'Validation error' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(false)
    })

    it('ERR_NOT_FOUND 不可重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_NOT_FOUND', message: 'Not found' }
      })

      const { shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(false)
    })
  })

  describe('最大重试次数', () => {
    it('达到最大重试次数后停止', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'Timeout', retryable: true }
      })

      const { result, shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 3, // 达到 SCHEDULER_MAX_RETRY
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(false)
      expect(result.error.code).toBe('ERR_MAX_RETRY')
      expect(fn).not.toHaveBeenCalled() // 达到最大次数后不调用 fn
    })
  })

  describe('成功场景', () => {
    it('成功时返回结果且不重试', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'success',
        output: { data: 'result' }
      })

      const { result, shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(shouldRetry).toBe(false)
      expect(result.status).toBe('success')
      expect(result.output.data).toBe('result')
    })
  })

  describe('异常处理', () => {
    it('捕获未预期的异常', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Unexpected error'))

      const { result, shouldRetry } = await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds: [],
        logger: mockLogger
      })

      expect(result.status).toBe('failure')
      expect(result.error.code).toBe('ERR_UNKNOWN')
      expect(shouldRetry).toBe(false) // Error 对象没有 retryable 字段
    })
  })

  describe('排除 Agent IDs', () => {
    it('fn 接收 excludeAgentIds 参数', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'success',
        output: { data: 'result' }
      })

      const excludeAgentIds = ['agent-1', 'agent-2']

      await retryService.executeWithRetry({
        fn,
        retryCount: 0,
        excludeAgentIds,
        logger: mockLogger
      })

      expect(fn).toHaveBeenCalledWith(excludeAgentIds)
    })
  })

  describe('上一次结果传递', () => {
    it('lastResult 被正确传递', async () => {
      const fn = vi.fn().mockResolvedValue({
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'Timeout', retryable: true }
      })

      const lastResult = {
        status: 'failure',
        error: { code: 'ERR_TIMEOUT', message: 'Previous timeout', retryable: true }
      }

      await retryService.executeWithRetry({
        fn,
        lastResult,
        retryCount: 1,
        excludeAgentIds: [],
        logger: mockLogger
      })

      // 函数应该被调用
      expect(fn).toHaveBeenCalled()
    })
  })
})
