import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { createSSEConnection } from '../../api/sse'
import { useConnectionStore } from '../../stores/connection'
import { useAgentStore } from '../../stores/agents'
import { useTaskStore } from '../../stores/tasks'

const SSE_URL = `${import.meta.env.VITE_API_BASE || ''}/admin/stream`

export function Layout ({ children }) {
  const setConnected = useConnectionStore((s) => s.setConnected)
  const agentStore = useAgentStore()
  const taskStore = useTaskStore()

  useEffect(() => {
    const conn = createSSEConnection(SSE_URL, {
      onConnected: () => setConnected(true),
      onDisconnected: () => setConnected(false),
      onSnapshot: (data) => {
        agentStore.setSnapshot(data)
        taskStore.setSnapshot(data)
      },
      onAgentUpdated: (data) => agentStore.updateAgent(data),
      onTaskUpdated: (data) => taskStore.updateTask(data)
    })

    return () => conn.destroy()
  }, [])

  return (
    <div style={styles.shell}>
      <Sidebar />
      <div style={styles.main}>
        <Header />
        <main style={styles.content}>
          {children}
        </main>
      </div>
    </div>
  )
}

const styles = {
  shell: {
    display: 'flex',
    minHeight: '100vh'
  },
  main: {
    flex: 1,
    marginLeft: 'var(--sidebar-width)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh'
  },
  content: {
    flex: 1,
    padding: 24,
    overflow: 'auto'
  }
}
