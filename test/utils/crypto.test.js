import { describe, it, expect } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import {
  verifyJoinSignature,
  verifySignedNonce,
  generateNonce
} from '../../src/utils/crypto.js'

describe('crypto', () => {
  const TOKEN = 'test-colony-token'

  describe('verifyJoinSignature', () => {
    it('returns true for valid signature', () => {
      const timestamp = '2026-04-03T10:00:00Z'
      const signature = createHash('sha256')
        .update(timestamp + TOKEN)
        .digest('hex')

      expect(verifyJoinSignature(timestamp, signature, TOKEN)).toBe(true)
    })

    it('returns false for invalid signature', () => {
      expect(verifyJoinSignature('2026-04-03T10:00:00Z', 'bad-signature', TOKEN)).toBe(false)
    })

    it('returns false for wrong token', () => {
      const timestamp = '2026-04-03T10:00:00Z'
      const signature = createHash('sha256')
        .update(timestamp + TOKEN)
        .digest('hex')

      expect(verifyJoinSignature(timestamp, signature, 'wrong-token')).toBe(false)
    })

    it('returns false for wrong timestamp', () => {
      const signature = createHash('sha256')
        .update('2026-04-03T10:00:00Z' + TOKEN)
        .digest('hex')

      expect(verifyJoinSignature('2026-04-03T10:00:01Z', signature, TOKEN)).toBe(false)
    })
  })

  describe('verifySignedNonce', () => {
    it('returns true for valid HMAC', () => {
      const nonce = 'a3f8c2e1d4b5'
      const signedNonce = createHmac('sha256', TOKEN)
        .update(nonce)
        .digest('hex')

      expect(verifySignedNonce(nonce, signedNonce, TOKEN)).toBe(true)
    })

    it('returns false for invalid HMAC', () => {
      expect(verifySignedNonce('nonce', 'bad-hmac', TOKEN)).toBe(false)
    })

    it('returns false for wrong token', () => {
      const nonce = 'a3f8c2e1d4b5'
      const signedNonce = createHmac('sha256', TOKEN)
        .update(nonce)
        .digest('hex')

      expect(verifySignedNonce(nonce, signedNonce, 'wrong-token')).toBe(false)
    })

    it('returns false for wrong nonce', () => {
      const signedNonce = createHmac('sha256', TOKEN)
        .update('correct-nonce')
        .digest('hex')

      expect(verifySignedNonce('wrong-nonce', signedNonce, TOKEN)).toBe(false)
    })
  })

  describe('generateNonce', () => {
    it('returns a hex string', () => {
      const nonce = generateNonce()
      expect(nonce).toMatch(/^[0-9a-f]+$/)
    })

    it('returns 32 chars with default bytes=16', () => {
      expect(generateNonce()).toHaveLength(32)
    })

    it('respects custom byte length', () => {
      expect(generateNonce(8)).toHaveLength(16)
    })

    it('generates unique values', () => {
      const a = generateNonce()
      const b = generateNonce()
      expect(a).not.toBe(b)
    })
  })
})
