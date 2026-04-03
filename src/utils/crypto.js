/**
 * 签名验证工具
 *
 * 用于 Colony 握手协议中的身份验证：
 * - join 阶段：SHA256(timestamp + token)
 * - verify 阶段：HMAC-SHA256(nonce, token)
 */

import { createHash, createHmac, randomBytes } from 'node:crypto'

/**
 * 验证 join 请求的签名
 *
 * @param {string} timestamp - ISO 8601 时间戳
 * @param {string} signature - Agent 提供的签名
 * @param {string} token - 共享密钥（COLONY_TOKEN）
 * @returns {boolean}
 */
export function verifyJoinSignature(timestamp, signature, token) {
  const expected = createHash('sha256')
    .update(timestamp + token)
    .digest('hex')
  return expected === signature
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
  return expected === signedNonce
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
