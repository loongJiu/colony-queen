import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Overview } from './pages/Overview'
import { Tasks } from './pages/Tasks'
import { TaskDetail } from './pages/TaskDetail'
import { Agents } from './pages/Agents'
import { AgentDetail } from './pages/AgentDetail'
import { AgentProfile } from './pages/AgentProfile'
import { Sessions } from './pages/Sessions'
import { SessionDetail } from './pages/SessionDetail'

export default function App () {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Overview />} />
        <Route path='/tasks' element={<Tasks />} />
        <Route path='/tasks/:taskId' element={<TaskDetail />} />
        <Route path='/agents' element={<Agents />} />
        <Route path='/agents/:agentId' element={<AgentDetail />} />
        <Route path='/agents/:agentId/profile' element={<AgentProfile />} />
        <Route path='/sessions' element={<Sessions />} />
        <Route path='/sessions/:sessionId' element={<SessionDetail />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </Layout>
  )
}
