import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAgentStore } from '../stores/agents'
import { useTaskStore } from '../stores/tasks'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import { LoadBar } from '../components/common/LoadBar'
import { STATUS_COLORS, STATUS_LABELS, TASK_STATUS_COLORS } from '../utils/constants'
import { formatTimeAgo, formatDuration, formatPercent } from '../utils/format'
import {
  ArrowLeft, Cpu, Activity, Server, Clock, Zap, BrainCircuit,
  Wrench, Swords, Globe, Shield, Hash, Loader2, Trash2, LogOut,
  Radio, Hexagon, Circle, ListTodo, ExternalLink, AlertTriangle,
  Timer, Layers, Gauge, Award
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
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke='var(--color-load-track)'
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap='round'
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease',
            filter: `drop-shadow(0 0 4px ${color}44)`
          }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <span style={{
          fontSize: 28,
          fontWeight: 700,
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: '-0.04em',
          color,
          lineHeight: 1
        }}>
          {Math.round(pct)}
        </span>
        <span style={{
          fontSize: 9,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          marginTop: 2
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
  const r = 16

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      {/* Glow ring */}
      {pulse && (
        <div style={{
          position: 'absolute',
          inset: -4,
          borderRadius: '50%',
          border: `2px solid ${color}33`,
          animation: 'hex-pulse 2s ease-in-out infinite'
        }} />
      )}
      {/* Hexagon shape */}
      <svg width={size} height={size} viewBox='0 0 56 56' style={{ position: 'absolute' }}>
        <polygon
          points='28,2 52,16 52,40 28,54 4,40 4,16'
          fill={`${color}15`}
          stroke={color}
          strokeWidth='1.5'
          style={{ transition: 'fill 0.3s, stroke 0.3s' }}
        />
      </svg>
      {/* Status dot in center */}
      <span style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: pulse ? `0 0 12px ${color}88` : `0 0 6px ${color}44`,
        position: 'relative',
        zIndex: 1,
        animation: pulse ? 'dot-breathe 2s ease-in-out infinite' : undefined
      }} />
    </div>
  )
}

/* ── Metric Card ── */
function MetricCard ({ icon: Icon, label, value, subValue, color }) {
  return (
    <div style={s.metricCard}>
      <div style={{ ...s.metricIcon, background: color ? `${color}15` : 'var(--color-primary-dim)', color: color || 'var(--color-primary)' }}>
        <Icon size={16} />
      </div>
      <div>
        <div style={s.metricLabel}>{label}</div>
        <div style={{ ...s.metricValue, color: color || 'var(--color-text)' }}>{value}</div>
        {subValue && <div style={s.metricSub}>{subValue}</div>}
      </div>
    </div>
  )
}

/* ── Info Row ── */
function InfoRow ({ icon: Icon, label, value, mono = true }) {
  return (
    <div style={s.infoRow}>
      <Icon size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
      <span style={s.infoLabel}>{label}</span>
      <span style={{ ...s.infoValue, fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined }}>
        {value || '-'}
      </span>
    </div>
  )
}

/* ── Related Task Row ── */
function TaskRow ({ task, agentId }) {
  const navigate = useNavigate()
  const status = task.status || 'pending'
  const color = TASK_STATUS_COLORS[status] || '#6b7280'
  const steps = task.steps || []
  const results = task.results || []
  const agentStepResults = results.filter((r) => r.agentId === agentId)

  return (
    <div
      style={s.taskRow}
      onClick={() => navigate(`/tasks/${task.taskId}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color + '55'
        e.currentTarget.style.background = 'var(--color-surface-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.background = 'var(--color-surface)'
      }}
    >
      <div style={s.taskRowLeft}>
        <StatusDot status={status} size='sm' pulse={status === 'running'} />
        <div style={s.taskRowInfo}>
          <span style={s.taskRowName}>{task.request?.description || task.taskId}</span>
          <span style={s.taskRowId}>{task.taskId}</span>
        </div>
      </div>
      <div style={s.taskRowMeta}>
        <span style={{ ...s.taskRowStatus, color }}>{STATUS_LABELS[status]}</span>
        {agentStepResults.length > 0 && (
          <span style={s.taskRowSteps}>{agentStepResults.length} step{agentStepResults.length > 1 ? 's' : ''}</span>
        )}
        {task.createdAt && <span style={s.taskRowTime}>{formatTimeAgo(task.createdAt)}</span>}
        <ExternalLink size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
      </div>
    </div>
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

  // Loading state: agent might not be in store yet
  if (!agent) {
    return (
      <div style={s.loadingWrap}>
        <Hexagon size={32} style={{ color: 'var(--color-primary)', animation: 'spin 2s linear infinite' }} />
        <span style={s.loadingText}>Locating agent in the hive...</span>
        <button style={s.backBtn} onClick={() => navigate('/agents')}>
          <ArrowLeft size={14} /> Back to Agents
        </button>
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
      <div style={s.topBar}>
        <button
          style={s.backBtn}
          onClick={() => navigate('/agents')}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
        >
          <ArrowLeft size={14} />
          <span>Agents</span>
        </button>
      </div>

      {/* Hero section */}
      <div style={s.hero}>
        <div style={s.heroLeft}>
          <HexStatusBadge status={status} pulse={isBusy || status === 'error'} />
          <div style={s.heroInfo}>
            <h1 style={s.heroName}>{name || agentId}</h1>
            <div style={s.heroMeta}>
              <span style={{ ...s.heroRole, color: statusColor }}>{role}</span>
              <span style={s.heroSep}>&middot;</span>
              <span style={{ ...s.heroStatus, color: statusColor }}>
                {STATUS_LABELS[status]}
              </span>
              {description && (
                <>
                  <span style={s.heroSep}>&middot;</span>
                  <span style={s.heroDesc}>{description}</span>
                </>
              )}
            </div>
            <div style={s.heroIdRow}>
              <Hash size={10} style={{ opacity: 0.3 }} />
              <span style={s.heroId}>{agentId}</span>
            </div>
          </div>
        </div>

        <div style={s.heroRight}>
          {/* Profile link */}
          <button
            style={s.profileLinkBtn}
            onClick={() => navigate(`/agents/${agentId}/profile`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-primary)'
              e.currentTarget.style.borderColor = 'var(--color-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            <Award size={13} />
            Capability Profile
          </button>

          {/* Action button */}
          <button
            onClick={handleKick}
            disabled={kicking}
            style={{
              ...s.kickBtn,
              opacity: kicking ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!kicking) {
                e.currentTarget.style.color = 'var(--color-error)'
                e.currentTarget.style.borderColor = 'var(--color-error)'
                e.currentTarget.style.background = 'var(--color-error-dim)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.background = 'var(--color-surface)'
            }}
          >
            {kicking
              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : (isOnline ? <LogOut size={13} /> : <Trash2 size={13} />)
            }
            {isOnline ? 'Kick Agent' : 'Remove Agent'}
          </button>
        </div>
      </div>

      {/* Key metrics row */}
      <div style={s.metricsRow}>
        <div style={s.metricGaugeCard}>
          <CircularGauge value={load} size={100} strokeWidth={5} status={status} />
          <div style={s.metricGaugeSub}>
            <Cpu size={10} style={{ opacity: 0.5 }} />
            <span>System Load</span>
          </div>
        </div>
        <div style={s.metricCardsCol}>
          <MetricCard icon={Activity} label='Active Tasks' value={activeTasks} color={activeTasks > 0 ? 'var(--color-warning)' : undefined} />
          <MetricCard icon={Server} label='Queue Depth' value={queueDepth} color={queueDepth > 0 ? 'var(--color-info)' : undefined} />
          <MetricCard icon={Timer} label='Uptime' value={uptime} />
          <MetricCard
            icon={Radio}
            label='Last Heartbeat'
            value={heartbeatAge}
            color={!isOnline ? 'var(--color-error)' : undefined}
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div style={s.twoCol}>
        {/* Left: Profile */}
        <section style={s.section}>
          <SectionHeader icon={Shield} title='Agent Profile' />
          <div style={s.profileCard}>
            {/* Capabilities */}
            {capabilities.length > 0 && (
              <div style={s.profileSection}>
                <div style={s.profileSectionLabel}>
                  <Zap size={10} style={{ opacity: 0.5 }} />
                  <span>Capabilities</span>
                </div>
                <div style={s.tagRow}>
                  {capabilities.map((cap) => (
                    <span key={typeof cap === 'string' ? cap : cap.capability} style={s.capTag}>
                      {typeof cap === 'string' ? cap : cap.capability}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div style={s.profileSection}>
                <div style={s.profileSectionLabel}>
                  <Hash size={10} style={{ opacity: 0.5 }} />
                  <span>Tags</span>
                </div>
                <div style={s.tagRow}>
                  {tags.map((tag) => (
                    <span key={tag} style={s.tagChip}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Model & Tools */}
            <div style={s.profileDivider} />
            <InfoRow icon={BrainCircuit} label='Model' value={modelName} />
            {toolIds.length > 0 && <InfoRow icon={Wrench} label='Tools' value={toolIds.join(', ')} />}
            {skillIds.length > 0 && <InfoRow icon={Swords} label='Skills' value={skillIds.join(', ')} />}
            <InfoRow icon={Globe} label='Endpoint' value={endpoint} />

            {/* Constraints */}
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
          </div>
        </section>

        {/* Right: Activity */}
        <section style={s.section}>
          <SectionHeader icon={Activity} title='Activity' />
          <div style={s.activityCard}>
            {/* Heartbeat status */}
            <div style={s.heartbeatRow}>
              <div style={s.heartbeatLeft}>
                <span style={{
                  ...s.heartbeatDot,
                  backgroundColor: isOnline ? 'var(--color-success)' : 'var(--color-error)',
                  animation: isOnline ? 'dot-breathe 2s ease-in-out infinite' : undefined
                }} />
                <div>
                  <div style={s.heartbeatTitle}>
                    {isOnline ? 'Heartbeat Active' : 'Heartbeat Lost'}
                  </div>
                  <div style={s.heartbeatSub}>
                    {isOnline
                      ? `Last pulse ${heartbeatAge}`
                      : `Last seen ${heartbeatAge}`
                    }
                  </div>
                </div>
              </div>
              <div style={{
                ...s.heartbeatBadge,
                color: isOnline ? 'var(--color-success)' : 'var(--color-error)',
                background: isOnline ? 'var(--color-success-dim)' : 'var(--color-error-dim)'
              }}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>

            {/* Timeline info */}
            <div style={s.timelineDivider} />
            <div style={s.timeline}>
              <TimelineEntry
                label='Agent Joined'
                value={joinedAt ? new Date(joinedAt).toLocaleString() : '-'}
                active
              />
              <TimelineEntry
                label='Last Heartbeat'
                value={lastHeartbeat ? new Date(lastHeartbeat).toLocaleString() : '-'}
                active={isOnline}
              />
              <TimelineEntry
                label='Current Status'
                value={STATUS_LABELS[status]}
                color={statusColor}
                active
                last
              />
            </div>

            {/* Offline warning */}
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
          </div>
        </section>
      </div>

      {/* Related Tasks */}
      <section style={s.section}>
        <SectionHeader icon={ListTodo} title={`Related Tasks (${relatedTasks.length})`} />
        {relatedTasks.length === 0 ? (
          <div style={s.emptyTasks}>
            <ListTodo size={20} style={{ color: 'var(--color-text-muted)', opacity: 0.3 }} />
            <span style={s.emptyTasksText}>No tasks assigned to this agent yet</span>
          </div>
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

/* ── Sub-components ── */

function SectionHeader ({ icon: Icon, title }) {
  return (
    <div style={s.sectionHeader}>
      <Icon size={14} style={{ color: 'var(--color-text-muted)' }} />
      <span style={s.sectionHeaderText}>{title}</span>
      <div style={s.sectionLine} />
    </div>
  )
}

function ConstraintItem ({ label, value }) {
  return (
    <div style={s.constraintItem}>
      <span style={s.constraintLabel}>{label}</span>
      <span style={s.constraintValue}>{value}</span>
    </div>
  )
}

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

/* ── Styles ── */

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    animation: 'fadeIn 0.3s ease-out'
  },

  /* Top bar */
  topBar: {
    marginBottom: -8
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--color-text-muted)',
    padding: '4px 0',
    transition: 'color 0.15s'
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
  loadingText: {
    fontSize: 13
  },

  /* Hero */
  hero: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 24,
    flexWrap: 'wrap',
    padding: '24px 28px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    position: 'relative',
    overflow: 'hidden'
  },
  heroLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20
  },
  heroInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  heroName: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.03em',
    color: 'var(--color-text)',
    margin: 0,
    lineHeight: 1.2
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
  heroSep: {
    color: 'var(--color-border)',
    fontSize: 10
  },
  heroStatus: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
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
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: 'var(--color-text-muted)',
    letterSpacing: '-0.01em'
  },
  heroRight: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8
  },
  profileLinkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    transition: 'all 0.15s'
  },
  kickBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    transition: 'all 0.15s'
  },

  /* Metrics row */
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: 16,
    alignItems: 'stretch'
  },
  metricGaugeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '20px 28px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
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
  metricCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    transition: 'border-color 0.2s'
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  metricLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.03em',
    lineHeight: 1.2
  },
  metricSub: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
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
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  sectionHeaderText: {
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

  /* Profile card */
  profileCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  profileSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
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
  capTag: {
    fontSize: 10,
    padding: '3px 8px',
    borderRadius: 4,
    background: 'var(--color-primary-dim)',
    color: 'var(--color-primary)',
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.01em',
    fontWeight: 500
  },
  tagChip: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'var(--color-surface-hover)',
    color: 'var(--color-text-secondary)',
    fontFamily: "'IBM Plex Mono', monospace"
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
    fontSize: 12
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
    borderRadius: 'var(--radius-sm)'
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
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.03em',
    color: 'var(--color-text)'
  },

  /* Activity card */
  activityCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
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
    fontFamily: "'IBM Plex Mono', monospace"
  },
  heartbeatBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 4,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '0.06em'
  },
  timelineDivider: {
    height: 1,
    background: 'var(--color-border)'
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
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.01em'
  },
  offlineWarning: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-warning-dim)',
    border: '1px solid rgba(245, 158, 11, 0.2)'
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
  taskRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'all 0.15s'
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
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)'
  },
  taskRowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0
  },
  taskRowStatus: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  taskRowSteps: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
  },
  taskRowTime: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
  },
  emptyTasks: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
  },
  emptyTasksText: {
    fontSize: 12,
    color: 'var(--color-text-muted)'
  }
}
