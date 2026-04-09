import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../stores/agents'
import { useTaskStore } from '../stores/tasks'
import { useProfileStore } from '../stores/profiles'
import { AgentCard } from '../components/agent/AgentCard'
import {
  Card, Button, Badge, StatCard, PageHeader, SectionHeader, Skeleton
} from '../components/ui'
import {
  Bot, Activity, BarChart3, Trophy, Target, Star, Zap
} from 'lucide-react'

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#c2884d']

export function Overview () {
  const navigate = useNavigate()
  const agents = useAgentStore((s) => s.agents)
  const agentStats = useAgentStore((s) => s.agentStats)
  const taskStats = useTaskStore((s) => s.taskStats)
  const adminStats = useProfileStore((s) => s.stats)
  const profiles = useProfileStore((s) => s.profiles)
  const fetchStats = useProfileStore((s) => s.fetchStats)
  const fetchProfiles = useProfileStore((s) => s.fetchProfiles)
  const [loading, setLoading] = useState(true)

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
    Promise.all([fetchStats(), fetchProfiles()]).finally(() => setLoading(false))
  }, [])

  const statsCards = [
    {
      icon: <Bot size={18} />,
      label: 'Online Agents',
      value: onlineAgents,
      sub: `${agents.length} registered`,
      accentColor: 'var(--color-success)',
    },
    {
      icon: <Activity size={18} />,
      label: 'Running Tasks',
      value: runningTasks,
      sub: `${taskStats.pending || 0} pending`,
      accentColor: 'var(--color-warning)',
    },
    {
      icon: <BarChart3 size={18} />,
      label: 'Total Tasks',
      value: totalTasks,
      sub: `${taskStats.success || 0} completed`,
      accentColor: 'var(--color-info)',
    },
    {
      icon: <Target size={18} />,
      label: 'Success Rate',
      value: adminStats.successRate != null ? `${Math.round(adminStats.successRate * 100)}%` : '—',
      sub: 'Overall',
      accentColor: 'var(--color-success)',
    },
    {
      icon: <Star size={18} />,
      label: 'Avg Score',
      value: adminStats.avgScore != null ? (Math.round(adminStats.avgScore * 10) / 10) : '—',
      sub: 'Feedback rating',
      accentColor: 'var(--color-primary)',
    },
  ]

  return (
    <div style={s.page}>
      <PageHeader title='Overview' />

      {/* Stat cards with staggered animation */}
      {loading ? (
        <div style={s.statsRow}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} variant='rect' height={88} style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : (
        <div style={s.statsRow}>
          {statsCards.map((cfg, i) => (
            <div
              key={cfg.label}
              style={{ ...s.statItem, animationDelay: `${i * 40}ms` }}
            >
              <StatCard {...cfg} />
            </div>
          ))}
        </div>
      )}

      {/* Top Agents Leaderboard */}
      {!loading && topAgents.length > 0 && (
        <div style={{ ...s.section, animationDelay: '200ms' }}>
          <SectionHeader
            title='Top Agents'
            sub={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Trophy size={11} style={{ color: 'var(--color-primary)' }} />
                {topAgents.length}
              </span>
            }
          />
          <div style={s.leaderboard}>
            {topAgents.map((p, i) => {
              const score = p.overallScore ?? 0
              const rankColor = RANK_COLORS[i] || 'var(--color-text-muted)'
              return (
                <Card
                  key={p.agentId}
                  hoverable
                  onClick={() => navigate(`/agents/${p.agentId}/profile`)}
                  style={{
                    ...s.leaderRow,
                    animationDelay: `${(i + 5) * 40}ms`,
                  }}
                >
                  <div style={s.leaderLeft}>
                    <span style={{
                      ...s.leaderRank,
                      color: rankColor,
                    }}>
                      {i < 3 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Zap size={12} fill={rankColor} />
                          {i + 1}
                        </span>
                      ) : (
                        `#${i + 1}`
                      )}
                    </span>
                    <span style={s.leaderName}>{p.agentName || p.agentId}</span>
                  </div>
                  <div style={s.leaderRight}>
                    <Badge variant='tag' color={rankColor}>
                      <Target size={10} /> {score}
                    </Badge>
                    <Badge variant='count'>
                      {p.totalTasks} tasks
                    </Badge>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Agent Grid */}
      <div style={{ ...s.section, animationDelay: '400ms' }}>
        <SectionHeader
          title='Agents'
          sub={
            <Badge variant='count' color='var(--color-primary)'>
              {agents.length}
            </Badge>
          }
        />

        {loading ? (
          <div style={s.agentGrid}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} variant='rect' height={160} style={{ animationDelay: `${(i + 10) * 40}ms` }} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <div style={s.emptyInner}>
              <Bot size={32} strokeWidth={1.5} style={{ opacity: 0.4, color: 'var(--color-text-muted)' }} />
              <span style={s.emptyTitle}>No agents registered</span>
              <span style={s.emptyDesc}>Start worker agents to see them appear here</span>
            </div>
          </Card>
        ) : (
          <div style={s.agentGrid}>
            {agents.map((agent, i) => (
              <div
                key={agent.agentId}
                style={{ ...s.agentItem, animationDelay: `${(i + 12) * 40}ms` }}
              >
                <AgentCard agent={agent} onClick={() => navigate(`/agents/${agent.agentId}`)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 12,
  },
  statItem: {
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },

  /* Section */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },

  /* Leaderboard */
  leaderboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  leaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },
  leaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  leaderRank: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    width: 36,
    flexShrink: 0,
  },
  leaderName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  leaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  /* Agent grid */
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
  },
  agentItem: {
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },

  /* Empty state */
  emptyInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-muted)',
  },
  emptyDesc: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    opacity: 0.7,
  },
}
