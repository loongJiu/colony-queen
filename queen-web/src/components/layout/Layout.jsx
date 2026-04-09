import { useEffect, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { createSSEConnection } from '../../api/sse'
import { useConnectionStore } from '../../stores/connection'
import { useAgentStore } from '../../stores/agents'
import { useTaskStore } from '../../stores/tasks'

const SSE_URL = `${import.meta.env.VITE_API_BASE || ''}/admin/stream`

export function Layout ({ children }) {
  const setConnected = useConnectionStore((s) => s.setConnected)
  const agentSetSnapshot = useAgentStore((s) => s.setSnapshot)
  const agentUpdateAgent = useAgentStore((s) => s.updateAgent)
  const taskSetSnapshot = useTaskStore((s) => s.setSnapshot)
  const taskUpdateTask = useTaskStore((s) => s.updateTask)
  const taskAddLog = useTaskStore((s) => s.addLog)

  // 用 ref 持有最新的 handler 引用，避免 SSE effect 依赖 store selectors
  const handlersRef = useRef(null)
  handlersRef.current = {
    onConnected: () => setConnected(true),
    onDisconnected: () => setConnected(false),
    onSnapshot: (data) => {
      agentSetSnapshot(data)
      taskSetSnapshot(data)
    },
    onAgentUpdated: (data) => agentUpdateAgent(data),
    onTaskUpdated: (data) => taskUpdateTask(data),
    onTaskLog: (data) => taskAddLog(data)
  }

  useEffect(() => {
    const conn = createSSEConnection(SSE_URL, {
      onConnected: () => handlersRef.current.onConnected(),
      onDisconnected: () => handlersRef.current.onDisconnected(),
      onSnapshot: (data) => handlersRef.current.onSnapshot(data),
      onAgentUpdated: (data) => handlersRef.current.onAgentUpdated(data),
      onTaskUpdated: (data) => handlersRef.current.onTaskUpdated(data),
      onTaskLog: (data) => handlersRef.current.onTaskLog(data)
    })

    return () => conn.destroy()
  }, [])

  return (
    <div style={s.shell}>
      <Sidebar />
      <div style={s.main}>
        <Header />
        <main style={s.content}>
          {children}
        </main>
      </div>
    </div>
  )
}

const s = {
  shell: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden'
  },
  main: {
    flex: 1,
    marginLeft: 'var(--sidebar-width)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden'
  },
  content: {
    flex: 1,
    padding: 24,
    overflowY: 'auto'
  }
}
