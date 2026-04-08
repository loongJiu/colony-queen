import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSSEConnection } from '../../src/api/sse.js'

describe('createSSEConnection', () => {
  let mockES
  let MockEventSource

  beforeEach(() => {
    vi.useFakeTimers()
    mockES = {
      close: vi.fn(),
      onopen: null,
      onerror: null,
      addEventListener: vi.fn()
    }
    MockEventSource = vi.fn(() => {
      const es = mockES
      // Defer so the constructor can assign properties
      setTimeout(() => {
        es.onopen?.()
      }, 0)
      return es
    })
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates EventSource with url', () => {
    const handlers = {}
    createSSEConnection('/api/stream', handlers)
    expect(MockEventSource).toHaveBeenCalledWith('/api/stream')
  })

  it('registers event listeners', () => {
    const handlers = {}
    createSSEConnection('/api/stream', handlers)
    expect(mockES.addEventListener).toHaveBeenCalledWith('snapshot', expect.any(Function))
    expect(mockES.addEventListener).toHaveBeenCalledWith('agent.updated', expect.any(Function))
    expect(mockES.addEventListener).toHaveBeenCalledWith('task.updated', expect.any(Function))
    expect(mockES.addEventListener).toHaveBeenCalledWith('task.log', expect.any(Function))
  })

  it('calls onConnected when connection opens', () => {
    const onConnected = vi.fn()
    createSSEConnection('/api/stream', { onConnected })
    vi.advanceTimersByTime(1)
    expect(onConnected).toHaveBeenCalled()
  })

  it('returns destroy function that closes connection', () => {
    const { destroy } = createSSEConnection('/api/stream', {})
    destroy()
    expect(mockES.close).toHaveBeenCalled()
  })

  it('does not reconnect after destroy', () => {
    const { destroy } = createSSEConnection('/api/stream', {})
    destroy()

    // Simulate error after destroy
    MockEventSource.mockClear()
    mockES.onerror?.()
    vi.advanceTimersByTime(30000)

    expect(MockEventSource).not.toHaveBeenCalled()
  })

  it('reconnects with exponential backoff on error', () => {
    const onDisconnected = vi.fn()
    createSSEConnection('/api/stream', { onDisconnected })

    MockEventSource.mockClear()
    mockES.onerror?.()

    expect(onDisconnected).toHaveBeenCalled()
    expect(MockEventSource).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(MockEventSource).toHaveBeenCalledTimes(1)
  })
})
