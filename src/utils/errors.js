/**
 * BeeError — Colony 系统统一错误基类
 *
 * 所有模块抛出的错误都应使用 BeeError 或其子类，
 * 以保证错误响应格式一致。
 */

/**
 * @typedef {Object} ErrorPayload
 * @property {string}  code       - 错误码，如 'ERR_AGENT_NOT_FOUND'
 * @property {string}  message    - 人类可读的错误描述
 * @property {number}  statusCode - HTTP 状态码
 * @property {boolean} retryable  - 是否可重试
 * @property {string}  [requestId] - 关联的请求 ID
 */

export class BeeError extends Error {
  /** @type {string} */
  code
  /** @type {number} */
  statusCode
  /** @type {boolean} */
  retryable
  /** @type {string|undefined} */
  requestId

  /**
   * @param {string|ErrorPayload} payload
   */
  constructor(payload) {
    if (typeof payload === 'string') {
      super(payload)
      this.code = 'ERR_UNKNOWN'
      this.statusCode = 500
      this.retryable = false
    } else {
      super(payload.message)
      this.code = payload.code ?? 'ERR_UNKNOWN'
      this.statusCode = payload.statusCode ?? 500
      this.retryable = payload.retryable ?? false
      this.requestId = payload.requestId
    }
    this.name = 'BeeError'
  }

  /**
   * 转换为统一错误响应格式
   * @param {string} [requestId]
   * @returns {{ error: { code: string, message: string, requestId: string|undefined, retryable: boolean } }}
   */
  toJSON(requestId) {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId ?? requestId,
        retryable: this.retryable
      }
    }
  }
}

export class NotFoundError extends BeeError {
  /**
   * @param {string} message
   * @param {string} [requestId]
   */
  constructor(message, requestId) {
    super({ code: 'ERR_NOT_FOUND', message, statusCode: 404, retryable: false, requestId })
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends BeeError {
  /**
   * @param {string} message
   * @param {string} [requestId]
   */
  constructor(message, requestId) {
    super({ code: 'ERR_VALIDATION', message, statusCode: 400, retryable: false, requestId })
    this.name = 'ValidationError'
  }
}

export class TimeoutError extends BeeError {
  /**
   * @param {string} message
   * @param {string} [requestId]
   */
  constructor(message, requestId) {
    super({ code: 'ERR_TIMEOUT', message, statusCode: 504, retryable: true, requestId })
    this.name = 'TimeoutError'
  }
}

export class UnavailableError extends BeeError {
  /**
   * @param {string} message
   * @param {string} [requestId]
   */
  constructor(message, requestId) {
    super({ code: 'ERR_UNAVAILABLE', message, statusCode: 503, retryable: true, requestId })
    this.name = 'UnavailableError'
  }
}

export class UnauthorizedError extends BeeError {
  /**
   * @param {string} message
   * @param {string} [requestId]
   */
  constructor(message, requestId) {
    super({ code: 'ERR_UNAUTHORIZED', message, statusCode: 401, retryable: false, requestId })
    this.name = 'UnauthorizedError'
  }
}
