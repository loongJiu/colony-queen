import { describe, it, expect, beforeEach } from 'vitest'
import { useConnectionStore } from '../../src/stores/connection.js'

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({ connected: false })
  })

  it('starts disconnected', () => {
    expect(useConnectionStore.getState().connected).toBe(false)
  })

  it('setConnected updates state', () => {
    useConnectionStore.getState().setConnected(true)
    expect(useConnectionStore.getState().connected).toBe(true)

    useConnectionStore.getState().setConnected(false)
    expect(useConnectionStore.getState().connected).toBe(false)
  })
})
