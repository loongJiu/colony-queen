/**
 * Storage 工厂与接口测试
 */

import { describe, it, expect } from 'vitest'
import { createStorage } from '../../src/storage/index.js'
import { MemoryStore } from '../../src/storage/memory-store.js'
import { assertImplements } from '../../src/storage/interface.js'

describe('createStorage', () => {
  it('creates MemoryStore by default', () => {
    const store = createStorage()
    expect(store).toBeInstanceOf(MemoryStore)
  })

  it('creates MemoryStore when backend is "memory"', () => {
    const store = createStorage({ backend: 'memory' })
    expect(store).toBeInstanceOf(MemoryStore)
  })

  it('throws for unknown backend', () => {
    expect(() => createStorage({ backend: 'redis' })).toThrow('Unknown storage backend')
  })
})

describe('assertImplements', () => {
  it('passes for MemoryStore', () => {
    const store = new MemoryStore()
    expect(() => assertImplements(store)).not.toThrow()
  })

  it('throws for object missing methods', () => {
    expect(() => assertImplements({})).toThrow('missing methods')
  })
})
