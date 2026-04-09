/**
 * LLMClient — LLM 调用客户端
 *
 * 封装对 LLM 服务（GLM/Anthropic/OpenAI）的调用，
 * 提供统一的 complete(prompt, options) 接口。
 *
 * GLM 使用 Anthropic 兼容端点，共用 @anthropic-ai/sdk。
 * OpenAI 使用原生 fetch。
 */

import Anthropic from '@anthropic-ai/sdk'

export class LLMClient {
  #provider
  #model
  #apiKey
  #timeout
  #logger
  /** @type {Anthropic | null} */
  #client
  /** @type {string} */
  #openaiBaseUrl

  /**
   * @param {{
   *   provider: 'glm' | 'anthropic' | 'openai',
   *   model: string,
   *   apiKey: string,
   *   timeout: number,
   *   logger?: object,
   *   glmBaseUrl?: string,
   *   anthropicBaseUrl?: string,
   *   openaiBaseUrl?: string
   * }} config
   */
  constructor({ provider, model, apiKey, timeout, logger = console, glmBaseUrl = '', anthropicBaseUrl = '', openaiBaseUrl = '' }) {
    this.#provider = provider
    this.#model = model
    this.#apiKey = apiKey
    this.#timeout = timeout
    this.#logger = logger
    this.#openaiBaseUrl = openaiBaseUrl

    if (apiKey && (provider === 'glm' || provider === 'anthropic')) {
      const baseURL = provider === 'glm' ? glmBaseUrl : (anthropicBaseUrl || undefined)
      this.#client = new Anthropic({
        apiKey,
        ...(baseURL && { baseURL })
      })
    }

    this.#logger.info?.({ provider, model, configured: this.isConfigured }, 'LLM client initialized')
  }

  /** @returns {boolean} */
  get isConfigured() {
    return this.#apiKey !== ''
  }

  /** @returns {string} */
  get provider() {
    return this.#provider
  }

  /** @returns {string} */
  get model() {
    return this.#model
  }

  /**
   * 发送补全请求
   *
   * @param {string} prompt - 用户提示
   * @param {{ systemPrompt?: string, temperature?: number, maxTokens?: number }} [options]
   * @returns {Promise<string>} LLM 响应文本
   * @throws {Error} 未配置、网络错误或 API 错误时抛出
   */
  async complete(prompt, options = {}) {
    if (!this.isConfigured) {
      throw new Error('LLM API key not configured')
    }

    const startAt = Date.now()

    try {
      let content

      if (this.#provider === 'openai') {
        content = await this.#callOpenAI(prompt, options)
      } else {
        // GLM 和 Anthropic 共用 Anthropic SDK
        const response = await this.#client.messages.create(
          {
            model: this.#model,
            max_tokens: options.maxTokens ?? 2048,
            messages: [{ role: 'user', content: prompt }],
            ...(options.systemPrompt && { system: options.systemPrompt }),
            ...(options.temperature != null && { temperature: options.temperature })
          },
          { signal: AbortSignal.timeout(this.#timeout) }
        )
        content = response.content[0].text
      }

      this.#logger.debug?.(
        { provider: this.#provider, durationMs: Date.now() - startAt },
        'LLM complete success'
      )

      return content
    } catch (err) {
      this.#logger.error?.(
        { provider: this.#provider, err: err.message, durationMs: Date.now() - startAt },
        'LLM complete failed'
      )
      throw err
    }
  }

  /**
   * @param {string} prompt
   * @param {{ systemPrompt?: string, temperature?: number, maxTokens?: number }} options
   * @returns {Promise<string>}
   */
  async #callOpenAI(prompt, options) {
    const messages = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await fetch(this.#openaiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2048
      }),
      signal: AbortSignal.timeout(this.#timeout)
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message ?? response.status}`)
    }
    return data.choices[0].message.content
  }
}
