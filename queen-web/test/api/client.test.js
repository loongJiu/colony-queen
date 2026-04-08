import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// apiFetch uses import.meta.env which needs to be mocked
vi.stubGlobal('import.meta', { env: { VITE_API_BASE: '' } })

let apiFetch

describe('apiFetch', () => {
  const originalFetch = globalThis.fetch

  beforeEach(async () => {
    // Dynamic import after mock setup
    const mod = await import('../../src/api/client.js')
    apiFetch = mod.apiFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('makes GET request and returns JSON', async () => {
    const mockData = { agents: [] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData
    })

    const result = await apiFetch('/api/agents')
    expect(result).toEqual(mockData)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/agents',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )
  })

  it('returns null for 204 No Content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null
    })

    const result = await apiFetch('/api/agents/a1', { method: 'DELETE' })
    expect(result).toBeNull()
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal error' } })
    })

    await expect(apiFetch('/api/bad')).rejects.toThrow('Internal error')
  })

  it('throws with status code when error body is not parseable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json') }
    })

    await expect(apiFetch('/api/bad')).rejects.toThrow('HTTP 503')
  })

  it('merges custom headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    })

    await apiFetch('/api/test', {
      headers: { Authorization: 'Bearer token123' }
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token123'
        })
      })
    )
  })
})
