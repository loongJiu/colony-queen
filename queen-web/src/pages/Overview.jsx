import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../stores/agents'
import { useTaskStore } from '../stores/tasks'
import { useProfileStore } from '../stores/profiles'
import { AgentCard } from '../components/agent/AgentCard'
import { EmptyState } from '../components/common/EmptyState'
import { Bot, Activity, BarChart3, Trophy, Target, Star } from 'lucide-react'

export function Overview () {
  const navigate = useNavigate()
  const agents = useAgentStore((s) => s.agents)
  const agentStats = useAgentStore((s) => s.agentStats)
  const taskStats = useTaskStore((s) => s.taskStats)
  const adminStats = useProfileStore((s) => s.stats)
  const profiles = useProfileStore((s) => s.profiles)
  const fetchStats = useProfileStore((s) => s.fetchStats)
  const fetchProfiles = useProfileStore((s) => s.fetchProfiles)

  const onlineAgents = (agentStats.idle || 0) + (agentStats.busy || 0) + (agentStats.error || 0)
  const runningTasks = taskStats.running || 0
  const totalTasks = Object.values(taskStats).reduce((a, b) => a + b, 0)

  // Aggregate profiles by agentId for leaderboard
  const agentMap = new Map()
  for (const p of profiles) {
    const existing = agentMap.get(p.agentId) || { agentId: p.agentId, totalScore: 0, totalTasks: 0, capCount: 0 }
    existing.totalScore += p.actualScore * p.taskCount
    existing.totalTasks += p.taskCount
    existing.capCount += 1
    agentMap.set(p.agentId, existing)
  }
  const topAgents = [...agentMap.values()]
    .map(a => ({
      ...a,
      overallScore: a.totalTasks > 0 ? Math.round((a.totalScore / a.totalTasks) * 100) / 100 : 0
    }))
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 5)

  useEffect(() => {
    fetchStats()
    fetchProfiles()
  }, [])

  return (
    <div style={styles.page}>
      {/* Section title */}
      <div style={styles.sectionTitle}>
        <span style={styles.sectionTitleText}>Overview</span>
        <div style={styles.titleLine} />
      </div>

      {/* Stat cards */}
      <div style={styles.statsRow}>
        <StatCard
          icon={<Bot size={18} />}
          label='Online Agents'
          value={onlineAgents}
          sub={`${agents.length} registered`}
          accentColor='var(--color-success)'
          accentDim='var(--color-success-dim)'
        />
        <StatCard
          icon={<Activity size={18} />}
          label='Running Tasks'
          value={runningTasks}
          sub={`${taskStats.pending || 0} pending`}
          accentColor='var(--color-warning)'
          accentDim='var(--color-warning-dim)'
        />
        <StatCard
          icon={<BarChart3 size={18} />}
          label='Total Tasks'
          value={totalTasks}
          sub={`${taskStats.success || 0} completed`}
          accentColor='var(--color-info)'
          accentDim='var(--color-info-dim)'
        />
        <StatCard
          icon={<Target size={18} />}
          label='Success Rate'
          value={adminStats.successRate != null ? `${Math.round(adminStats.successRate * 100)}%` : '-'}
          sub='Overall'
          accentColor='var(--color-success)'
          accentDim='var(--color-success-dim)'
        />
        <StatCard
          icon={<Star size={18} />}
          label='Avg Score'
          value={adminStats.avgScore != null ? (Math.round(adminStats.avgScore * 10) / 10) : '-'}
          sub='Feedback rating'
          accentColor='var(--color-primary)'
          accentDim='var(--color-primary-dim)'
        />
      </div>

      {/* Agent Leaderboard */}
      {topAgents.length > 0 && (
        <div style={styles.section}>
          <div style={styles.agentsHeader}>
            <Trophy size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={styles.agentsTitle}>Top Agents</span>
            <span style={styles.agentsCount}>{topAgents.length}</span>
          </div>
          <div style={styles.leaderboard}>
            {topAgents.map((p, i) => {
              const score = p.overallScore ?? 0
              return (
                <div
                  key={p.agentId}
                  style={styles.leaderRow}
                  onClick={() => navigate(`/agents/${p.agentId}/profile`)}
                >
                  <div style={styles.leaderLeft}>
                    <span style={{
                      ...styles.leaderRank,
                      color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#c2884d' : 'var(--color-text-muted)'
                    }}>
                      #{i + 1}
                    </span>
                    <span style={styles.leaderName}>{p.agentName || p.agentId}</span>
                  </div>
                  <div style={styles.leaderRight}>
                    <span style={styles.leaderMetric}>
                      <Target size={10} /> {score}
                    </span>
                    <span style={styles.leaderMetric}>
                      <Activity size={10} /> {p.totalTasks} tasks
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Agents section */}
      <div style={styles.agentsSection}>
        <div style={styles.agentsHeader}>
          <span style={styles.agentsTitle}>Agents</span>
          <span style={styles.agentsCount}>{agents.length}</span>
        </div>

        {agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title='No agents registered'
            description='Start worker agents to see them appear here'
          />
        ) : (
          <div style={styles.agentGrid}>
            {agents.map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} onClick={() => navigate(`/agents/${agent.agentId}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard ({ icon, label, value, sub, accentColor, accentDim }) {
  return (
    <div style={{ ...styles.statCard, borderColor: accentColor + '22' }}>
      <div style={{
        ...styles.statIcon,
        background: accentDim,
        color: accentColor
      }}
      >
        {icon}
      </div>
      <div style={styles.statContent}>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value}</div>
        <div style={styles.statSub}>{sub}</div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    animation: 'fadeIn 0.3s ease-out'
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  sectionTitleText: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    whiteSpace: 'nowrap'
  },
  titleLine: {
    flex: 1,
    height: 1,
    background: 'linear-gradient(90deg, var(--color-border), transparent)'
  },

  /* Stats row */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 16
  },
  statCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    transition: 'border-color 0.2s'
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 500
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', 'SF Mono', monospace",
    lineHeight: 1.2,
    letterSpacing: '-0.04em'
  },
  statSub: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
  },

  /* Section */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },

  /* Leaderboard */
  leaderboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  leaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'all 0.15s'
  },
  leaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  leaderRank: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    width: 28
  },
  leaderName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  leaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  leaderMetric: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-secondary)'
  },

  /* Agents section */
  agentsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  agentsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  agentsTitle: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: '-0.02em'
  },
  agentsCount: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    padding: '2px 8px',
    borderRadius: 10,
    border: '1px solid var(--color-border)'
  },
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12
  }
}
