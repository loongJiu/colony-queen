/**
 * AgentProfile — Agent 能力画像可视化页面
 *
 * 展示 Agent 在各能力维度上的历史表现画像，
 * 包括综合得分、成功率、能力柱状图和趋势折线图。
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProfileStore } from '../stores/profiles'
import { apiFetch } from '../api/client'
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
      <div style={s.loadingWrap}>
        <Loader2 size={24} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
        <span style={s.loadingText}>Loading capability profile...</span>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
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
      {/* Top bar */}
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={() => navigate(`/agents/${agentId}`)}>
          <ArrowLeft size={14} />
          <span>Agent Detail</span>
        </button>
      </div>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <Award size={20} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h1 style={s.title}>Capability Profile</h1>
            <span style={s.agentId}>{agentId}</span>
          </div>
        </div>
      </div>

      {/* Overall stats */}
      <div style={s.statsRow}>
        <OverallCard
          icon={<Target size={16} />}
          label='Overall Score'
          value={overall.score ?? '-'}
          accentColor='var(--color-primary)'
        />
        <OverallCard
          icon={<BarChart3 size={16} />}
          label='Success Rate'
          value={overall.successRate != null ? `${Math.round(overall.successRate * 100)}%` : '-'}
          accentColor='var(--color-success)'
        />
        <OverallCard
          icon={<Zap size={16} />}
          label='Total Tasks'
          value={overall.taskCount ?? '-'}
          accentColor='var(--color-info)'
        />
      </div>

      {/* Capability table */}
      {capabilities.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionTitle}>
            <Target size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={s.sectionTitleText}>Capabilities</span>
            <div style={s.sectionLine} />
          </div>
          <div style={s.capGrid}>
            {capabilities.map((cap, i) => (
              <div key={i} style={s.capCard}>
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
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bar chart */}
      {barData.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionTitle}>
            <BarChart3 size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={s.sectionTitleText}>Score Distribution</span>
            <div style={s.sectionLine} />
          </div>
          <div style={s.chartCard}>
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
                <Bar dataKey='score' fill='#f59e0b' radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Trend chart */}
      {trendData.length > 1 && (
        <section style={s.section}>
          <div style={s.sectionTitle}>
            <TrendingUp size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={s.sectionTitleText}>Score Trend</span>
            <div style={s.sectionLine} />
          </div>
          <div style={s.chartCard}>
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
                <Line type='monotone' dataKey='score' stroke='#f59e0b' strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  )
}

function OverallCard ({ icon, label, value, accentColor }) {
  return (
    <div style={{ ...s.overallCard, borderColor: accentColor + '22' }}>
      <div style={{ ...s.overallIcon, background: accentColor + '15', color: accentColor }}>
        {icon}
      </div>
      <div style={s.overallContent}>
        <div style={s.overallLabel}>{label}</div>
        <div style={{ ...s.overallValue, color: accentColor }}>{value}</div>
      </div>
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
  topBar: { marginBottom: -8 },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--color-text-muted)',
    padding: '4px 0',
    transition: 'color 0.15s',
    cursor: 'pointer'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    margin: 0
  },
  agentId: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)'
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 300,
    color: 'var(--color-text-muted)'
  },
  loadingText: { fontSize: 13 },

  /* Stats row */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12
  },
  overallCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 14
  },
  overallIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  overallContent: {
    display: 'flex',
    flexDirection: 'column'
  },
  overallLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  overallValue: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.03em',
    lineHeight: 1.2
  },

  /* Sections */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  sectionTitleText: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap'
  },
  sectionLine: {
    flex: 1,
    height: 1,
    background: 'linear-gradient(90deg, var(--color-border), transparent)'
  },

  /* Capability grid */
  capGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10
  },
  capCard: {
    padding: '14px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  capHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
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
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.02em'
  },

  /* Charts */
  chartCard: {
    padding: '16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
  }
}
