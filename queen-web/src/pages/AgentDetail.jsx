import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAgentStore } from '../stores/agents'
import { useTaskStore } from '../stores/tasks'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import { STATUS_COLORS, STATUS_LABELS, TASK_STATUS_COLORS } from '../utils/constants'
import { formatTimeAgo, formatDuration, formatPercent } from '../utils/format'
import {
  Card, Button, Badge, StatCard, PageHeader, SectionHeader, Skeleton
} from '../components/ui'
import {
  ArrowLeft, Cpu, Activity, Server, Clock, Zap, BrainCircuit,
  Wrench, Swords, Globe, Shield, Hash, Loader2, Trash2, LogOut,
  Radio, Hexagon, ExternalLink, AlertTriangle, Timer, Award, ListTodo
} from 'lucide-react'

/* ── Circular SVG Gauge ── */
function CircularGauge ({ value = 0, size = 120, strokeWidth = 6, status = 'idle' }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(100, Math.max(0, value))
  const offset = circumference - (pct / 100) * circumference
  const color =
    pct >= 90 ? STATUS_COLORS.error :
    pct >= 60 ? STATUS_COLORS.busy :
    STATUS_COLORS.success

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke='var(--color-load-track)' strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill='none' stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap='round'
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease',
            filter: `drop-shadow(0 0 4px ${color}44)`
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{
          fontSize: 28, fontWeight: 400, fontFamily: "'Bebas Neue', sans-serif",
          letterSpacing: '-0.04em', color, lineHeight: 1
        }}>
          {Math.round(pct)}
        </span>
        <span style={{
          fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.12em', fontWeight: 600, marginTop: 2
        }}>
          Load
        </span>
      </div>
    </div>
  )
}

/* ── Hex Status Badge ── */
function HexStatusBadge ({ status, pulse = false }) {
  const color = STATUS_COLORS[status] || '#6b7280'
  const size = 56

  return (
    <div style={{
      position: 'relative', width: size, height: size,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      {pulse && (
        <div style={{
          position: 'absolute', inset: -4, borderRadius: '50%',
          border: `2px solid ${color}33`, animation: 'hex-pulse 2s ease-in-out infinite'
        }} />
      )}
      <svg width={size} height={size} viewBox='0 0 56 56' style={{ position: 'absolute' }}>
        <polygon
          points='28,2 52,16 52,40 28,54 4,40 4,16'
          fill={`${color}15`} stroke={color} strokeWidth='1.5'
          style={{ transition: 'fill 0.3s, stroke 0.3s' }}
        />
      </svg>
      <span style={{
        width: 14, height: 14, borderRadius: '50%', backgroundColor: color,
        boxShadow: pulse ? `0 0 12px ${color}88` : `0 0 6px ${color}44`,
        position: 'relative', zIndex: 1,
        animation: pulse ? 'dot-breathe 2s ease-in-out infinite' : undefined
      }} />
    </div>
  )
}

/* ── Info Row ── */
function InfoRow ({ icon: Icon, label, value, mono = true }) {
  return (
    <div style={s.infoRow}>
      <Icon size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
      <span style={s.infoLabel}>{label}</span>
      <span style={{ ...s.infoValue, fontFamily: mono ? "'JetBrains Mono', monospace" : undefined }}>
        {value || '-'}
      </span>
    </div>
  )
}

/* ── Constraint Item ── */
function ConstraintItem ({ label, value }) {
  return (
    <div style={s.constraintItem}>
      <span style={s.constraintLabel}>{label}</span>
      <span style={s.constraintValue}>{value}</span>
    </div>
  )
}

/* ── Timeline Entry ── */
function TimelineEntry ({ label, value, color, active, last }) {
  return (
    <div style={s.timelineEntry}>
      <div style={s.timelineDotCol}>
        <span style={{
          ...s.timelineDot,
          backgroundColor: active ? (color || 'var(--color-primary)') : 'var(--color-border)',
          boxShadow: active ? `0 0 6px ${(color || 'var(--color-primary)')}44` : 'none'
        }} />
        {!last && <div style={s.timelineLine} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 16 }}>
        <div style={s.timelineLabel}>{label}</div>
        <div style={{ ...s.timelineValue, color: color || 'var(--color-text-secondary)' }}>{value}</div>
      </div>
    </div>
  )
}

/* ── Related Task Row ── */
function TaskRow ({ task, agentId }) {
  const navigate = useNavigate()
  const status = task.status || 'pending'
  const color = TASK_STATUS_COLORS[status] || '#6b7280'
  const results = task.results || []
  const agentStepResults = results.filter((r) => r.agentId === agentId)

  return (
    <Card
      hoverable
      onClick={() => navigate(`/tasks/${task.taskId}`)}
      padding='sm'
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <div style={s.taskRowLeft}>
        <StatusDot status={status} size='sm' pulse={status === 'running'} />
        <div style={s.taskRowInfo}>
          <span style={s.taskRowName}>{task.request?.description || task.taskId}</span>
          <span style={s.taskRowId}>{task.taskId}</span>
        </div>
      </div>
      <div style={s.taskRowMeta}>
        <Badge status={status}>{STATUS_LABELS[status]}</Badge>
        {agentStepResults.length > 0 && (
          <span style={s.taskRowSteps}>{agentStepResults.length} step{agentStepResults.length > 1 ? 's' : ''}</span>
        )}
        {task.createdAt && <span style={s.taskRowTime}>{formatTimeAgo(task.createdAt)}</span>}
        <ExternalLink size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
      </div>
    </Card>
  )
}

/* ── Main Page ── */
export function AgentDetail () {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const agent = useAgentStore((s) => s.agents.find((a) => a.agentId === agentId))
  const tasks = useTaskStore((s) => s.tasks)
  const [kicking, setKicking] = useState(false)

  // Find tasks related to this agent
  const relatedTasks = useMemo(() => {
    return tasks.filter((t) => {
      const results = t.results || []
      return results.some((r) => r.agentId === agentId)
    })
  }, [tasks, agentId])

  // Loading state
  if (!agent) {
    return (
      <div style={s.loadingWrap}>
        <Hexagon size={32} style={{ color: 'var(--color-primary)', animation: 'spin 2s linear infinite' }} />
        <span style={s.loadingText}>Locating agent in the hive...</span>
        <Button variant='ghost' size='sm' icon={ArrowLeft} onClick={() => navigate('/agents')}>Back to Agents</Button>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  const {
    role = 'worker',
    name,
    status = 'offline',
    load = 0,
    activeTasks = 0,
    queueDepth = 0,
    capabilities = [],
    model,
    toolIds = [],
    skillIds = [],
    endpoint,
    lastHeartbeat,
    joinedAt,
    constraints = {},
    tags = [],
    description
  } = agent

  const isOnline = status !== 'offline'
  const isBusy = status === 'busy'
  const statusColor = STATUS_COLORS[status] || '#6b7280'
  const modelName = typeof model === 'object' ? (model?.name || model?.model || '-') : (model || '-')
  const uptime = joinedAt ? formatDuration(Date.now() - joinedAt) : '-'
  const heartbeatAge = lastHeartbeat ? formatTimeAgo(lastHeartbeat) : '-'
  const action = isOnline ? 'kick' : 'remove'

  const handleKick = async () => {
    if (!window.confirm(`${action === 'kick' ? 'Kick' : 'Remove'} agent ${agentId}?`)) return
    setKicking(true)
    try {
      await apiFetch(`/admin/agents/${agentId}`, { method: 'DELETE' })
      navigate('/agents')
    } catch (err) {
      alert(`${action} failed: ${err.message}`)
    } finally {
      setKicking(false)
    }
  }

  return (
    <div style={s.page}>
      {/* CSS animations */}
      <style>{`
        @keyframes hex-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0; }
        }
        @keyframes dot-breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
        @keyframes gauge-glow {
          0%, 100% { filter: drop-shadow(0 0 4px ${statusColor}44); }
          50% { filter: drop-shadow(0 0 8px ${statusColor}66); }
        }
      `}</style>

      {/* Top bar */}
      <Button variant='ghost' size='sm' icon={ArrowLeft} onClick={() => navigate('/agents')}>Agents</Button>

      {/* Page header */}
      <PageHeader
        title={name || agentId}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant='outline' size='sm' icon={Award} onClick={() => navigate(`/agents/${agentId}/profile`)}>
              Capability Profile
            </Button>
            <Button
              variant='danger'
              size='sm'
              icon={isOnline ? LogOut : Trash2}
              loading={kicking}
              disabled={kicking}
              onClick={handleKick}
            >
              {isOnline ? 'Kick Agent' : 'Remove Agent'}
            </Button>
          </div>
        }
      />

      {/* Hero section */}
      <Card padding='lg' style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={s.heroLeft}>
          <HexStatusBadge status={status} pulse={isBusy || status === 'error'} />
          <div style={s.heroInfo}>
            <div style={s.heroMeta}>
              <Badge status={status} pulse={isBusy}>{STATUS_LABELS[status]}</Badge>
              <span style={{ ...s.heroRole, color: statusColor }}>{role}</span>
              {description && <span style={s.heroDesc}>{description}</span>}
            </div>
            <div style={s.heroIdRow}>
              <Hash size={10} style={{ opacity: 0.3 }} />
              <span style={s.heroId}>{agentId}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Key metrics row */}
      <div style={s.metricsRow}>
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '20px 28px' }}>
          <CircularGauge value={load} size={100} strokeWidth={5} status={status} />
          <div style={s.metricGaugeSub}>
            <Cpu size={10} style={{ opacity: 0.5 }} />
            <span>System Load</span>
          </div>
        </Card>
        <div style={s.metricCardsCol}>
          <StatCard size='compact' icon={Activity} label='Active Tasks' value={activeTasks} accentColor={activeTasks > 0 ? 'var(--color-warning)' : 'var(--color-primary)'} />
          <StatCard size='compact' icon={Server} label='Queue Depth' value={queueDepth} accentColor={queueDepth > 0 ? 'var(--color-info)' : 'var(--color-primary)'} />
          <StatCard size='compact' icon={Timer} label='Uptime' value={uptime} accentColor='var(--color-primary)' />
          <StatCard size='compact' icon={Radio} label='Last Heartbeat' value={heartbeatAge} accentColor={!isOnline ? 'var(--color-error)' : 'var(--color-primary)'} />
        </div>
      </div>

      {/* Two-column layout */}
      <div style={s.twoCol}>
        {/* Left: Profile */}
        <section style={s.section}>
          <SectionHeader title='Agent Profile' />
          <Card>
            {capabilities.length > 0 && (
              <div style={s.profileSection}>
                <div style={s.profileSectionLabel}>
                  <Zap size={10} style={{ opacity: 0.5 }} />
                  <span>Capabilities</span>
                </div>
                <div style={s.tagRow}>
                  {capabilities.map((cap) => (
                    <Badge key={typeof cap === 'string' ? cap : cap.capability} variant='capability'>
                      {typeof cap === 'string' ? cap : cap.capability}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {tags.length > 0 && (
              <div style={s.profileSection}>
                <div style={s.profileSectionLabel}>
                  <Hash size={10} style={{ opacity: 0.5 }} />
                  <span>Tags</span>
                </div>
                <div style={s.tagRow}>
                  {tags.map((tag) => <Badge key={tag} variant='tag'>{tag}</Badge>)}
                </div>
              </div>
            )}

            <div style={s.profileDivider} />
            <InfoRow icon={BrainCircuit} label='Model' value={modelName} />
            {toolIds.length > 0 && <InfoRow icon={Wrench} label='Tools' value={toolIds.join(', ')} />}
            {skillIds.length > 0 && <InfoRow icon={Swords} label='Skills' value={skillIds.join(', ')} />}
            <InfoRow icon={Globe} label='Endpoint' value={endpoint} />

            <div style={s.profileDivider} />
            <div style={s.profileSectionLabel}>
              <Shield size={10} style={{ opacity: 0.5 }} />
              <span>Constraints</span>
            </div>
            <div style={s.constraintsGrid}>
              <ConstraintItem label='Max Concurrent' value={constraints.max_concurrent ?? 1} />
              <ConstraintItem label='Timeout' value={`${constraints.timeout_default ?? 30}s`} />
              <ConstraintItem label='Queue Max' value={constraints.queue_max ?? 100} />
              <ConstraintItem label='Retry Max' value={constraints.retry_max ?? 3} />
            </div>
          </Card>
        </section>

        {/* Right: Activity */}
        <section style={s.section}>
          <SectionHeader title='Activity' />
          <Card>
            {/* Heartbeat status */}
            <div style={s.heartbeatRow}>
              <div style={s.heartbeatLeft}>
                <span style={{
                  ...s.heartbeatDot,
                  backgroundColor: isOnline ? 'var(--color-success)' : 'var(--color-error)',
                  animation: isOnline ? 'dot-breathe 2s ease-in-out infinite' : undefined
                }} />
                <div>
                  <div style={s.heartbeatTitle}>{isOnline ? 'Heartbeat Active' : 'Heartbeat Lost'}</div>
                  <div style={s.heartbeatSub}>
                    {isOnline ? `Last pulse ${heartbeatAge}` : `Last seen ${heartbeatAge}`}
                  </div>
                </div>
              </div>
              <Badge status={isOnline ? 'success' : 'error'}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Badge>
            </div>

            <div style={s.timelineDivider} />
            <div style={s.timeline}>
              <TimelineEntry label='Agent Joined' value={joinedAt ? new Date(joinedAt).toLocaleString() : '-'} active />
              <TimelineEntry label='Last Heartbeat' value={lastHeartbeat ? new Date(lastHeartbeat).toLocaleString() : '-'} active={isOnline} />
              <TimelineEntry label='Current Status' value={STATUS_LABELS[status]} color={statusColor} active last />
            </div>

            {!isOnline && (
              <div style={s.offlineWarning}>
                <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <div>
                  <div style={s.offlineWarningTitle}>Agent is offline</div>
                  <div style={s.offlineWarningText}>
                    Heartbeat timeout detected. This agent is no longer responding to the Queen.
                    Running tasks may be rescheduled.
                  </div>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* Related Tasks */}
      <section style={s.section}>
        <SectionHeader title={`Related Tasks`} sub={`${relatedTasks.length}`} />
        {relatedTasks.length === 0 ? (
          <Card style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px', color: 'var(--color-text-muted)' }}>
            <ListTodo size={20} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 12 }}>No tasks assigned to this agent yet</span>
          </Card>
        ) : (
          <div style={s.tasksList}>
            {relatedTasks.map((task) => (
              <TaskRow key={task.taskId} task={task} agentId={agentId} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ── Styles ── */

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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 300,
    color: 'var(--color-text-muted)'
  },
  loadingText: { fontSize: 13 },

  /* Hero */
  heroLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20
  },
  heroInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    justifyContent: 'center',
    minHeight: 56
  },
  heroMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  heroRole: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  },
  heroDesc: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic'
  },
  heroIdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  heroId: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: 'var(--color-text-muted)',
    letterSpacing: '-0.01em'
  },

  /* Metrics row */
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: 16,
    alignItems: 'stretch'
  },
  metricGaugeSub: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  metricCardsCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12
  },

  /* Two-column */
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: 16
  },

  /* Section */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },

  /* Profile card internals */
  profileSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 8
  },
  profileSectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5
  },
  profileDivider: {
    height: 1,
    background: 'var(--color-border)',
    margin: '4px 0'
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    marginBottom: 4
  },
  infoLabel: {
    color: 'var(--color-text-muted)',
    fontSize: 10,
    width: 60,
    flexShrink: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 600
  },
  infoValue: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  constraintsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginTop: 4
  },
  constraintItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 12px',
    background: 'var(--color-surface-hover)',
    borderRadius: '2px'
  },
  constraintLabel: {
    fontSize: 9,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  constraintValue: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.03em',
    color: 'var(--color-text)'
  },

  /* Activity card internals */
  heartbeatRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  heartbeatLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  heartbeatDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0
  },
  heartbeatTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  heartbeatSub: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace"
  },
  timelineDivider: {
    height: 1,
    background: 'var(--color-border)',
    margin: '8px 0'
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column'
  },
  timelineEntry: {
    display: 'flex',
    gap: 12
  },
  timelineDotCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 10
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: 4
  },
  timelineLine: {
    width: 1,
    flex: 1,
    background: 'var(--color-border)',
    marginTop: 4
  },
  timelineLabel: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontWeight: 500
  },
  timelineValue: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.01em'
  },
  offlineWarning: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    borderRadius: '2px',
    background: 'var(--color-warning-dim)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    marginTop: 8
  },
  offlineWarningTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-warning)',
    marginBottom: 2
  },
  offlineWarningText: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    lineHeight: 1.5
  },

  /* Related Tasks */
  tasksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  taskRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1
  },
  taskRowInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0
  },
  taskRowName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  taskRowId: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)'
  },
  taskRowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0
  },
  taskRowSteps: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace"
  },
  taskRowTime: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace"
  }
}
