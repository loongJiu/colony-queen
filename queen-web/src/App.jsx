import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Overview } from './pages/Overview'
import { Tasks } from './pages/Tasks'
import { TaskDetail } from './pages/TaskDetail'
import { Agents } from './pages/Agents'
import { AgentDetail } from './pages/AgentDetail'

export default function App () {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Overview />} />
        <Route path='/tasks' element={<Tasks />} />
        <Route path='/tasks/:taskId' element={<TaskDetail />} />
        <Route path='/agents' element={<Agents />} />
        <Route path='/agents/:agentId' element={<AgentDetail />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </Layout>
  )
}
