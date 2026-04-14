const MAX_RETRY_DELAY = 30000
const BASE_RETRY_DELAY = 1000

/**
 * 创建 SSE 连接
 *
 * @param {string} url - SSE 端点 URL
 * @param {Object} handlers - 事件回调
 * @param {() => void} [handlers.onConnected]
 * @param {() => void} [handlers.onDisconnected]
 * @param {(data: Object) => void} [handlers.onSnapshot]
 * @param {(data: Object) => void} [handlers.onAgentUpdated]
 * @param {(data: Object) => void} [handlers.onTaskUpdated]
 * @returns {{ destroy: () => void }}
 */
export function createSSEConnection (url, handlers) {
  let es = null
  let retryCount = 0
  let destroyed = false

  function connect () {
    if (destroyed) return

    es = new EventSource(url)

    es.onopen = () => {
      retryCount = 0
      handlers.onConnected?.()
    }

    es.addEventListener('snapshot', (e) => {
      try { handlers.onSnapshot?.(JSON.parse(e.data)) } catch { /* ignore malformed JSON */ }
    })

    es.addEventListener('agent.updated', (e) => {
      try { handlers.onAgentUpdated?.(JSON.parse(e.data)) } catch { /* ignore malformed JSON */ }
    })

    es.addEventListener('task.updated', (e) => {
      try { handlers.onTaskUpdated?.(JSON.parse(e.data)) } catch { /* ignore malformed JSON */ }
    })

    es.addEventListener('task.log', (e) => {
      try { handlers.onTaskLog?.(JSON.parse(e.data)) } catch { /* ignore malformed JSON */ }
    })

    es.onerror = () => {
      es.close()
      if (destroyed) return

      handlers.onDisconnected?.()

      const delay = Math.min(BASE_RETRY_DELAY * (2 ** retryCount), MAX_RETRY_DELAY)
      retryCount++
      setTimeout(connect, delay)
    }
  }

  connect()

  return {
    destroy () {
      destroyed = true
      es?.close()
    }
  }
}
