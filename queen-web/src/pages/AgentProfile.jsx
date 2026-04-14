/**
 * AgentProfile — Agent 能力画像可视化页面
 *
 * 展示 Agent 在各能力维度上的历史表现画像，
 * 包括综合得分、成功率、能力柱状图和趋势折线图。
 */

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProfileStore } from '../stores/profiles'
import {
  Card, Button, Badge, StatCard, PageHeader, SectionHeader, Skeleton
} from '../components/ui'
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, Minus,
  BarChart3, Target, Award, Zap
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid
} from 'recharts'

export function AgentProfile () {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const profile = useProfileStore((s) => s.profileDetail)
  const loading = useProfileStore((s) => s.loading)
  const fetchProfile = useProfileStore((s) => s.fetchProfile)

  useEffect(() => {
    fetchProfile(agentId)
  }, [agentId])

  if (loading || !profile) {
    return (
      <div style={s.page}>
        <Button variant='ghost' size='sm' icon={ArrowLeft} onClick={() => navigate(`/agents/${agentId}`)}>Agent Detail</Button>
        <div style={s.loadingWrap}>
          <Skeleton variant='rect' width='100%' height={60} />
          <div style={s.skeletonStatsRow}>
            <Skeleton variant='rect' height={72} count={3} />
          </div>
          <Skeleton variant='rect' height={200} />
          <Skeleton variant='rect' height={180} />
        </div>
      </div>
    )
  }

  const capabilities = profile.capabilities || []
  const overall = profile.overall || {}

  // 柱状图数据
  const barData = capabilities.map((cap) => ({
    name: cap.capability || cap.name,
    score: cap.actualScore ?? cap.score ?? 0,
    successRate: Math.round((cap.successRate ?? 0) * 100)
  }))

  // 趋势数据
  const trendData = (profile.trend || []).map((t, i) => ({
    index: i + 1,
    score: t.score ?? t.overallScore ?? 0,
    successRate: Math.round((t.successRate ?? 0) * 100)
  }))

  const trendIcon = (trend) => {
    if (trend === 'up') return <TrendingUp size={12} style={{ color: 'var(--color-success)' }} />
    if (trend === 'down') return <TrendingDown size={12} style={{ color: 'var(--color-error)' }} />
    return <Minus size={12} style={{ color: 'var(--color-text-muted)' }} />
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes staggerIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top bar */}
      <Button variant='ghost' size='sm' icon={ArrowLeft} onClick={() => navigate(`/agents/${agentId}`)}>Agent Detail</Button>

      {/* Header */}
      <PageHeader
        title='Capability Profile'
        actions={
          <span style={s.agentIdBadge}>
            <span style={s.agentIdText}>{agentId}</span>
          </span>
        }
      />

      {/* Overall stats */}
      <div style={s.statsRow}>
        <StatCard
          icon={Target}
          label='Overall Score'
          value={overall.score ?? '-'}
          accentColor='var(--color-primary)'
        />
        <StatCard
          icon={BarChart3}
          label='Success Rate'
          value={overall.successRate != null ? `${Math.round(overall.successRate * 100)}%` : '-'}
          accentColor='var(--color-success)'
        />
        <StatCard
          icon={Zap}
          label='Total Tasks'
          value={overall.taskCount ?? '-'}
          accentColor='var(--color-info)'
        />
      </div>

      {/* Capability grid */}
      {capabilities.length > 0 && (
        <section style={s.section}>
          <SectionHeader title='Capabilities' sub={`${capabilities.length}`} />
          <div style={s.capGrid}>
            {capabilities.map((cap, i) => (
              <Card
                key={i}
                style={{
                  animation: `staggerIn 0.35s ease-out ${i * 50}ms backwards`
                }}
              >
                <div style={s.capHeader}>
                  <span style={s.capName}>{cap.capability || cap.name}</span>
                  {trendIcon(cap.trend)}
                </div>
                <div style={s.capMetrics}>
                  <div style={s.capMetric}>
                    <span style={s.capMetricLabel}>Score</span>
                    <span style={s.capMetricValue}>{cap.actualScore ?? cap.score ?? '-'}</span>
                  </div>
                  <div style={s.capMetric}>
                    <span style={s.capMetricLabel}>Success</span>
                    <span style={s.capMetricValue}>{cap.successRate != null ? `${Math.round(cap.successRate * 100)}%` : '-'}</span>
                  </div>
                  <div style={s.capMetric}>
                    <span style={s.capMetricLabel}>Tasks</span>
                    <span style={s.capMetricValue}>{cap.taskCount ?? '-'}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Bar chart */}
      {barData.length > 0 && (
        <section style={s.section}>
          <SectionHeader title='Score Distribution' />
          <Card>
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={barData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--color-border)' />
                <XAxis dataKey='name' tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12
                  }}
                  labelStyle={{ color: 'var(--color-text)' }}
                />
                <Bar dataKey='score' fill='#00e5ff' radius={[0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </section>
      )}

      {/* Trend chart */}
      {trendData.length > 1 && (
        <section style={s.section}>
          <SectionHeader title='Score Trend' />
          <Card>
            <ResponsiveContainer width='100%' height={200}>
              <LineChart data={trendData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--color-border)' />
                <XAxis dataKey='index' tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12
                  }}
                  labelStyle={{ color: 'var(--color-text)' }}
                />
                <Line type='monotone' dataKey='score' stroke='#00e5ff' strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </section>
      )}
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    animation: 'fadeIn 0.3s ease-out'
  },

  /* Loading */
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  skeletonStatsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12
  },

  /* Agent ID badge */
  agentIdBadge: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    padding: '3px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)'
  },
  agentIdText: {
    letterSpacing: '-0.01em'
  },

  /* Stats row */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12
  },

  /* Sections */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },

  /* Capability grid */
  capGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10
  },
  capHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  capName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  capMetrics: {
    display: 'flex',
    gap: 16
  },
  capMetric: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  capMetricLabel: {
    fontSize: 9,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  capMetricValue: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.02em'
  }
}
