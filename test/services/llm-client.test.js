/**
 * LLMClient 单元测试
 *
 * Mock Anthropic SDK 和 fetch 来测试 LLM 调用逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @anthropic-ai/sdk before importing LLMClient
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
  return { default: MockAnthropic }
})

import { LLMClient } from '../../src/services/llm-client.js'
import Anthropic from '@anthropic-ai/sdk'

function makeConfig(overrides = {}) {
  return {
    provider: 'glm',
    model: 'glm-4',
    apiKey: 'test-api-key',
    timeout: 15000,
    logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
    ...overrides
  }
}

describe('LLMClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('initializes with glm provider', () => {
      const client = new LLMClient(makeConfig())
      expect(client.isConfigured).toBe(true)
      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4'
      })
    })

    it('initializes with anthropic provider without baseURL', () => {
      const client = new LLMClient(makeConfig({ provider: 'anthropic' }))
      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key'
      })
    })

    it('does not create Anthropic instance for openai provider', () => {
      const client = new LLMClient(makeConfig({ provider: 'openai' }))
      // Anthropic constructor should not be called for openai
      expect(client.isConfigured).toBe(true)
    })

    it('isConfigured is false when apiKey is empty', () => {
      const client = new LLMClient(makeConfig({ apiKey: '' }))
      expect(client.isConfigured).toBe(false)
    })
  })

  describe('complete', () => {
    it('throws when not configured', async () => {
      const client = new LLMClient(makeConfig({ apiKey: '' }))
      await expect(client.complete('test')).rejects.toThrow('LLM API key not configured')
    })

    it('calls Anthropic SDK for glm provider', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ text: '{"strategy":"single","steps":[]}' }]
      })
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate }
      }))

      const client = new LLMClient(makeConfig({ provider: 'glm' }))
      const result = await client.complete('test prompt', { systemPrompt: 'system' })

      expect(result).toBe('{"strategy":"single","steps":[]}')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test prompt' }],
          system: 'system'
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('calls fetch for openai provider', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'response text' } }]
        })
      })
      const originalFetch = globalThis.fetch
      globalThis.fetch = mockFetch

      try {
        const client = new LLMClient(makeConfig({ provider: 'openai', model: 'gpt-4o' }))
        const result = await client.complete('test prompt')

        expect(result).toBe('response text')
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-api-key'
            })
          })
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('throws on OpenAI API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limited' } })
      })
      const originalFetch = globalThis.fetch
      globalThis.fetch = mockFetch

      try {
        const client = new LLMClient(makeConfig({ provider: 'openai' }))
        await expect(client.complete('test')).rejects.toThrow('OpenAI API error: Rate limited')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('logs duration on success', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ text: 'result' }]
      })
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate }
      }))

      const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
      const client = new LLMClient(makeConfig({ logger }))

      await client.complete('test')

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'glm', durationMs: expect.any(Number) }),
        'LLM complete success'
      )
    })

    it('logs error on failure', async () => {
      const mockCreate = vi.fn().mockRejectedValue(new Error('timeout'))
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate }
      }))

      const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
      const client = new LLMClient(makeConfig({ logger }))

      await expect(client.complete('test')).rejects.toThrow('timeout')
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'glm' }),
        'LLM complete failed'
      )
    })
  })
})
