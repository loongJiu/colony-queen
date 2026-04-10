/**
 * 签名验证工具
 *
 * 用于 Colony 握手协议中的身份验证：
 * - join 阶段：SHA256(timestamp + token)
 * - verify 阶段：HMAC-SHA256(nonce, token)
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** 签名时间戳最大偏移（5 分钟） */
const TIMESTAMP_MAX_DRIFT_MS = 5 * 60 * 1000

/**
 * 时序安全的字符串比较
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * 验证 join 请求的签名
 *
 * @param {string} timestamp - ISO 8601 时间戳
 * @param {string} signature - Agent 提供的签名
 * @param {string} token - 共享密钥（COLONY_TOKEN）
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifyJoinSignature(timestamp, signature, token) {
  // 检查时间戳新鲜度
  const ts = new Date(timestamp).getTime()
  if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_MAX_DRIFT_MS) {
    return { valid: false, reason: 'Timestamp expired or too far in the future' }
  }

  // 使用分隔符避免碰撞（HMAC 替代简单拼接）
  const expected = createHmac('sha256', token)
    .update(timestamp)
    .digest('hex')
  return { valid: safeEqual(expected, signature) }
}

/**
 * 验证 verify 请求的 HMAC 签名
 *
 * @param {string} nonce - Queen 发出的 nonce
 * @param {string} signedNonce - Agent 返回的 HMAC 签名
 * @param {string} token - 共享密钥（COLONY_TOKEN）
 * @returns {boolean}
 */
export function verifySignedNonce(nonce, signedNonce, token) {
  const expected = createHmac('sha256', token)
    .update(nonce)
    .digest('hex')
  return safeEqual(expected, signedNonce)
}

/**
 * 生成随机 nonce
 *
 * @param {number} [bytes=16] - 随机字节数
 * @returns {string} 十六进制字符串
 */
export function generateNonce(bytes = 16) {
  return randomBytes(bytes).toString('hex')
}
