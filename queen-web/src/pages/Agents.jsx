import { useState, useMemo } from 'react'
import { useAgentStore } from '../stores/agents'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import { LoadBar } from '../components/common/LoadBar'
import { EmptyState } from '../components/common/EmptyState'
import { STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import { formatTimeAgo, formatPercent } from '../utils/format'
import {
  Bot, Cpu, Wifi, WifiOff, Loader2,
  Search, Filter, RefreshCw, X, ChevronDown,
  Zap, Activity, Clock, Server, Trash2, LogOut,
  Wrench, BrainCircuit
} from 'lucide-react'

const STAT_CONFIGS = [
  { key: 'idle', label: 'Idle', icon: Bot, color: 'var(--color-idle)', dim: 'var(--color-surface-hover)' },
  { key: 'busy', label: 'Busy', icon: Cpu, color: 'var(--color-warning)', dim: 'var(--color-warning-dim)' },
  { key: 'error', label: 'Error', icon: WifiOff, color: 'var(--color-error)', dim: 'var(--color-error-dim)' },
  { key: 'offline', label: 'Offline', icon: WifiOff, color: 'var(--color-text-muted)', dim: 'var(--color-surface-hover)' }
]

const ROLE_OPTIONS = ['all', 'worker', 'scout', 'queen']
const STATUS_OPTIONS = ['all', 'idle', 'busy', 'error', 'offline']

export function Agents () {
  const agents = useAgentStore((s) => s.agents)
  const agentStats = useAgentStore((s) => s.agentStats)

  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [kicking, setKicking] = useState(null)

  const filtered = useMemo(() => {
    let list = agents
    if (statusFilter !== 'all') {
      list = list.filter((a) => a.status === statusFilter)
    }
    if (roleFilter !== 'all') {
      list = list.filter((a) => a.role === roleFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        a.agentId?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q)
      )
    }
    return list
  }, [agents, statusFilter, roleFilter, search])

  const hasFilters = statusFilter !== 'all' || roleFilter !== 'all' || search.trim()

  const clearFilters = () => {
    setStatusFilter('all')
    setRoleFilter('all')
    setSearch('')
  }

  const handleKick = async (agentId, action) => {
    if (!window.confirm(`${action === 'kick' ? 'Kick' : 'Remove'} agent ${agentId}?`)) return
    setKicking(agentId)
    try {
      await apiFetch(`/admin/agents/${agentId}`, { method: 'DELETE' })
    } catch (err) {
      alert(`${action} failed: ${err.message}`)
    } finally {
      setKicking(null)
    }
  }

  const total = agents.length

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.sectionTitle}>
        <span style={styles.sectionTitleText}>Agents</span>
        <span style={styles.countBadge}>{total}</span>
        <div style={styles.titleLine} />
      </div>

      {/* Stat cards */}
      <div style={styles.statsRow}>
        {STAT_CONFIGS.map((cfg) => (
          <StatCard
            key={cfg.key}
            {...cfg}
            value={agentStats[cfg.key] || 0}
            active={statusFilter === cfg.key}
            onClick={() => setStatusFilter(statusFilter === cfg.key ? 'all' : cfg.key)}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <div style={styles.selectWrap}>
            <Filter size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={styles.select}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: -18, pointerEvents: 'none' }} />
          </div>
          <div style={styles.selectWrap}>
            <Activity size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Status' : STATUS_LABELS[s] || s}
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: -18, pointerEvents: 'none' }} />
          </div>
          {hasFilters && (
            <button style={styles.clearBtn} onClick={clearFilters}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
        <div style={styles.searchWrap}>
          <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            type='text'
            placeholder='Search agent ID or name...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          {search && (
            <button style={styles.searchClear} onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Agent cards */}
      {filtered.length === 0 ? (
        <div style={styles.emptyCard}>
          <EmptyState
            icon={Bot}
            title={agents.length === 0 ? 'No agents registered' : 'No matching agents'}
            description={agents.length === 0 ? 'Start worker agents to see them appear here' : 'Try adjusting your filters'}
          />
        </div>
      ) : (
        <div style={styles.agentGrid}>
          {filtered.map((agent) => (
            <AgentDetailCard
              key={agent.agentId}
              agent={agent}
              kicking={kicking === agent.agentId}
              onKick={handleKick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Stat Card (matches Tasks.jsx pattern) ── */

function StatCard ({ icon: Icon, label, value, color, dim, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.statCard,
        borderColor: active ? color : 'var(--color-border)',
        borderLeftColor: color,
        background: active ? dim : 'var(--color-surface)'
      }}
    >
      <div style={{ ...styles.statIcon, background: dim, color }}>
        <Icon size={16} />
      </div>
      <div style={styles.statContent}>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value}</div>
      </div>
    </button>
  )
}

/* ── Agent Detail Card ── */

function AgentDetailCard ({ agent, kicking, onKick }) {
  const {
    agentId,
    role = 'worker',
    name,
    status = 'offline',
    load = 0,
    activeTasks = 0,
    queueDepth = 0,
    capabilities = [],
    model,
    toolIds = [],
    endpoint,
    lastHeartbeat,
    joinedAt,
    constraints = {}
  } = agent

  const isOnline = status !== 'offline'
  const isBusy = status === 'busy'
  const statusColor = STATUS_COLORS[status] || '#6b7280'
  const modelName = typeof model === 'object' ? (model?.name || model?.model || '-') : (model || '-')
  const action = isOnline ? 'kick' : 'remove'

  return (
    <div
      style={{
        ...styles.card,
        borderColor: isBusy ? STATUS_COLORS.busy + '44' : 'var(--color-border)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = statusColor + '66'
        e.currentTarget.style.boxShadow = `0 0 20px ${statusColor}11`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isBusy ? STATUS_COLORS.busy + '44' : 'var(--color-border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Card header */}
      <div style={styles.cardHeader}>
        <div style={styles.cardNameRow}>
          <StatusDot status={status} size='md' pulse={isBusy} />
          <div style={styles.cardNameCol}>
            <span style={styles.cardName}>{name || agentId}</span>
            <span style={styles.cardRole}>{role}</span>
          </div>
        </div>
        <span style={{ ...styles.cardStatusBadge, color: statusColor }}>
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div style={styles.cardSection}>
          <div style={styles.cardSectionLabel}>
            <Zap size={10} style={{ opacity: 0.5 }} />
            <span>Capabilities</span>
          </div>
          <div style={styles.tagRow}>
            {capabilities.map((cap) => (
              <span key={typeof cap === 'string' ? cap : cap.capability} style={styles.capTag}>
                {typeof cap === 'string' ? cap : cap.capability}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Model & Tools row */}
      <div style={styles.cardInfoGrid}>
        <div style={styles.cardInfoItem}>
          <BrainCircuit size={11} style={{ opacity: 0.4, flexShrink: 0 }} />
          <span style={styles.cardInfoLabel}>Model</span>
          <span style={styles.cardInfoValue}>{modelName}</span>
        </div>
        {toolIds.length > 0 && (
          <div style={styles.cardInfoItem}>
            <Wrench size={11} style={{ opacity: 0.4, flexShrink: 0 }} />
            <span style={styles.cardInfoLabel}>Tools</span>
            <span style={styles.cardInfoValue}>{toolIds.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Load section */}
      <div style={styles.cardSection}>
        <div style={styles.loadHeader}>
          <div style={styles.loadLabel}>
            <Cpu size={11} style={{ opacity: 0.5 }} />
            <span>Load</span>
          </div>
          <span style={{ ...styles.loadPct, color: statusColor }}>
            {formatPercent(load)}
          </span>
        </div>
        <LoadBar value={load} status={status} />
      </div>

      {/* Metrics row */}
      <div style={styles.metricsRow}>
        <MetricItem icon={<Activity size={10} />} label='Tasks' value={activeTasks} />
        <MetricItem icon={<Server size={10} />} label='Queue' value={queueDepth} />
        <MetricItem icon={<Clock size={10} />} label='Heartbeat' value={formatTimeAgo(lastHeartbeat)} />
      </div>

      {/* Offline notice */}
      {!isOnline && lastHeartbeat && (
        <div style={styles.offlineNotice}>
          <span style={styles.offlineDot} />
          <span style={styles.offlineText}>
            Last seen {formatTimeAgo(lastHeartbeat)} &middot; heartbeat timeout
          </span>
        </div>
      )}

      {/* Footer actions */}
      <div style={styles.cardFooter}>
        <span style={styles.cardAgentId} title={agentId}>
          {agentId}
        </span>
        <button
          onClick={() => onKick(agentId, action)}
          disabled={kicking}
          style={{
            ...styles.actionBtn,
            opacity: kicking ? 0.5 : 1
          }}
          onMouseEnter={(e) => {
            if (!kicking) {
              e.currentTarget.style.color = 'var(--color-error)'
              e.currentTarget.style.borderColor = 'var(--color-error)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-muted)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          {kicking ? <Loader2 size={12} className='spin' /> : (isOnline ? <LogOut size={12} /> : <Trash2 size={12} />)}
          {isOnline ? 'Kick' : 'Remove'}
        </button>
      </div>
    </div>
  )
}

/* ── Metric Item ── */

function MetricItem ({ icon, label, value }) {
  return (
    <div style={styles.metric}>
      <span style={{ opacity: 0.4 }}>{icon}</span>
      <span style={styles.metricLabel}>{label}</span>
      <span style={styles.metricValue}>{value}</span>
    </div>
  )
}

/* ── Styles ── */

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    animation: 'fadeIn 0.3s ease-out'
  },

  /* Header */
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  sectionTitleText: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    whiteSpace: 'nowrap'
  },
  countBadge: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    padding: '2px 8px',
    borderRadius: 10,
    border: '1px solid var(--color-border)'
  },
  titleLine: {
    flex: 1,
    height: 1,
    background: 'linear-gradient(90deg, var(--color-border), transparent)'
  },

  /* Stats */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    borderLeft: '3px solid',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    width: '100%'
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column'
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    lineHeight: 1.2,
    letterSpacing: '-0.04em'
  },

  /* Toolbar */
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  selectWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 28px 0 10px',
    height: 34,
    position: 'relative'
  },
  select: {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text)',
    fontSize: 12,
    fontWeight: 500,
    outline: 'none',
    cursor: 'pointer',
    paddingRight: 4
  },
  clearBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--color-text-muted)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    transition: 'all 0.15s'
  },
  searchWrap: {
    flex: 1,
    minWidth: 200,
    maxWidth: 360,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 10px',
    height: 34,
    transition: 'border-color 0.2s'
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text)',
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif"
  },
  searchClear: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-muted)',
    padding: 2
  },

  /* Empty card */
  emptyCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
  },

  /* Agent grid */
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 12
  },

  /* Agent detail card */
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    transition: 'border-color 0.2s, box-shadow 0.2s',
    cursor: 'default',
    position: 'relative',
    overflow: 'hidden'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  cardNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1
  },
  cardNameCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0
  },
  cardName: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  cardRole: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  cardStatusBadge: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0
  },

  /* Card sections */
  cardSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  cardSectionLabel: {
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
    gap: 4
  },
  capTag: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 4,
    background: 'var(--color-primary-dim)',
    color: 'var(--color-primary)',
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.01em'
  },

  /* Info grid */
  cardInfoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  cardInfoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    minWidth: 0
  },
  cardInfoLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    flexShrink: 0,
    width: 40
  },
  cardInfoValue: {
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  /* Load */
  loadHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  loadLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600
  },
  loadPct: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace"
  },

  /* Metrics row */
  metricsRow: {
    display: 'flex',
    gap: 16,
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    fontFamily: "'IBM Plex Mono', monospace"
  },
  metric: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  metricLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)'
  },
  metricValue: {
    fontWeight: 500
  },

  /* Offline notice */
  offlineNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface-hover)'
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: STATUS_COLORS.offline,
    flexShrink: 0
  },
  offlineText: {
    fontSize: 11,
    color: 'var(--color-text-muted)'
  },

  /* Card footer */
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTop: '1px solid var(--color-border)',
    marginTop: 2
  },
  cardAgentId: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: 'var(--color-text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 220
  },
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    padding: '4px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    transition: 'all 0.15s'
  }
}
