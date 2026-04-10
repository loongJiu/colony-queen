import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyJoinSignature,
  verifySignedNonce,
  generateNonce
} from '../../src/utils/crypto.js'

describe('crypto', () => {
  const TOKEN = 'test-colony-token'

  describe('verifyJoinSignature', () => {
    it('returns valid for fresh timestamp with correct signature', () => {
      const timestamp = new Date().toISOString()
      const signature = createHmac('sha256', TOKEN)
        .update(timestamp)
        .digest('hex')

      const result = verifyJoinSignature(timestamp, signature, TOKEN)
      expect(result.valid).toBe(true)
    })

    it('returns invalid for bad signature', () => {
      const timestamp = new Date().toISOString()
      const result = verifyJoinSignature(timestamp, 'bad-signature', TOKEN)
      expect(result.valid).toBe(false)
    })

    it('returns invalid for wrong token', () => {
      const timestamp = new Date().toISOString()
      const signature = createHmac('sha256', TOKEN)
        .update(timestamp)
        .digest('hex')

      const result = verifyJoinSignature(timestamp, signature, 'wrong-token')
      expect(result.valid).toBe(false)
    })

    it('returns invalid for expired timestamp', () => {
      const timestamp = '2020-01-01T00:00:00Z'
      const signature = createHmac('sha256', TOKEN)
        .update(timestamp)
        .digest('hex')

      const result = verifyJoinSignature(timestamp, signature, TOKEN)
      expect(result.valid).toBe(false)
      expect(result.reason).toBeTruthy()
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
