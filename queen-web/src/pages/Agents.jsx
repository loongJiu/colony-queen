import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../stores/agents'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import { LoadBar } from '../components/common/LoadBar'
import { EmptyState } from '../components/common/EmptyState'
import { STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import { formatTimeAgo, formatPercent } from '../utils/format'
import {
  Card, Button, Badge, StatCard, PageHeader, SectionHeader,
  Skeleton, SearchInput, FilterSelect
} from '../components/ui'
import {
  Bot, Cpu, Wifi, WifiOff, Loader2,
  RefreshCw, X, Zap, Activity, Clock, Server, Trash2, LogOut,
  Wrench, BrainCircuit
} from 'lucide-react'

const STAT_CONFIGS = [
  { key: 'idle', label: 'Idle', icon: Bot, color: 'var(--color-idle, #94a3b8)' },
  { key: 'busy', label: 'Busy', icon: Cpu, color: 'var(--color-warning, #f59e0b)' },
  { key: 'error', label: 'Error', icon: WifiOff, color: 'var(--color-error, #ef4444)' },
  { key: 'offline', label: 'Offline', icon: WifiOff, color: 'var(--color-text-muted, #6b7280)' }
]

export function Agents () {
  const navigate = useNavigate()
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
    <div style={s.page}>
      <style>{`
        @keyframes staggerIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <PageHeader
        title='Agents'
        count={total}
      />

      {/* Stat cards */}
      <div style={s.statsRow}>
        {STAT_CONFIGS.map((cfg) => (
          <StatCard
            key={cfg.key}
            icon={cfg.icon}
            label={cfg.label}
            value={agentStats[cfg.key] || 0}
            accentColor={cfg.color}
            active={statusFilter === cfg.key}
            onClick={() => setStatusFilter(statusFilter === cfg.key ? 'all' : cfg.key)}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.filterGroup}>
          <FilterSelect
            icon={Bot}
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: 'all', label: 'All Roles' },
              { value: 'worker', label: 'Worker' },
              { value: 'scout', label: 'Scout' },
              { value: 'queen', label: 'Queen' }
            ]}
          />
          <FilterSelect
            icon={Activity}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'idle', label: 'Idle' },
              { value: 'busy', label: 'Busy' },
              { value: 'error', label: 'Error' },
              { value: 'offline', label: 'Offline' }
            ]}
          />
          {hasFilters && (
            <Button variant='ghost' size='sm' icon={X} onClick={clearFilters}>Clear</Button>
          )}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder='Search agent ID or name...'
          style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
        />
      </div>

      {/* Agent cards */}
      {filtered.length === 0 ? (
        <Card style={{ padding: 32 }}>
          <EmptyState
            icon={Bot}
            title={agents.length === 0 ? 'No agents registered' : 'No matching agents'}
            description={agents.length === 0 ? 'Start worker agents to see them appear here' : 'Try adjusting your filters'}
          />
        </Card>
      ) : (
        <div style={s.agentGrid}>
          {filtered.map((agent, i) => (
            <AgentDetailCard
              key={agent.agentId}
              agent={agent}
              kicking={kicking === agent.agentId}
              onKick={handleKick}
              onClick={() => navigate(`/agents/${agent.agentId}`)}
              delay={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Agent Detail Card ── */

function AgentDetailCard ({ agent, kicking, onKick, onClick, delay }) {
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
    lastHeartbeat
  } = agent

  const isOnline = status !== 'offline'
  const isBusy = status === 'busy'
  const statusColor = STATUS_COLORS[status] || '#6b7280'
  const modelName = typeof model === 'object' ? (model?.name || model?.model || '-') : (model || '-')
  const action = isOnline ? 'kick' : 'remove'

  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        ...s.card,
        borderColor: isBusy ? STATUS_COLORS.busy + '44' : undefined,
        animation: `staggerIn 0.35s ease-out ${delay * 40}ms backwards`
      }}
    >
      {/* Card header */}
      <div style={s.cardHeader}>
        <div style={s.cardNameRow}>
          <StatusDot status={status} size='md' pulse={isBusy} />
          <div style={s.cardNameCol}>
            <span style={s.cardName}>{name || agentId}</span>
            <span style={s.cardRole}>{role}</span>
          </div>
        </div>
        <Badge status={status}>{STATUS_LABELS[status]}</Badge>
      </div>

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div style={s.cardSection}>
          <div style={s.cardSectionLabel}>
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

      {/* Model & Tools row */}
      <div style={s.cardInfoGrid}>
        <div style={s.cardInfoItem}>
          <BrainCircuit size={11} style={{ opacity: 0.4, flexShrink: 0 }} />
          <span style={s.cardInfoLabel}>Model</span>
          <span style={s.cardInfoValue}>{modelName}</span>
        </div>
        {toolIds.length > 0 && (
          <div style={s.cardInfoItem}>
            <Wrench size={11} style={{ opacity: 0.4, flexShrink: 0 }} />
            <span style={s.cardInfoLabel}>Tools</span>
            <span style={s.cardInfoValue}>{toolIds.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Load section */}
      <div style={s.cardSection}>
        <div style={s.loadHeader}>
          <div style={s.loadLabel}>
            <Cpu size={11} style={{ opacity: 0.5 }} />
            <span>Load</span>
          </div>
          <span style={{ ...s.loadPct, color: statusColor }}>{formatPercent(load)}</span>
        </div>
        <LoadBar value={load} status={status} />
      </div>

      {/* Metrics row */}
      <div style={s.metricsRow}>
        <MetricItem icon={<Activity size={10} />} label='Tasks' value={activeTasks} />
        <MetricItem icon={<Server size={10} />} label='Queue' value={queueDepth} />
        <MetricItem icon={<Clock size={10} />} label='Heartbeat' value={formatTimeAgo(lastHeartbeat)} />
      </div>

      {/* Offline notice */}
      {!isOnline && lastHeartbeat && (
        <div style={s.offlineNotice}>
          <span style={s.offlineDot} />
          <span style={s.offlineText}>
            Last seen {formatTimeAgo(lastHeartbeat)} &middot; heartbeat timeout
          </span>
        </div>
      )}

      {/* Footer actions */}
      <div style={s.cardFooter}>
        <span style={s.cardAgentId} title={agentId}>{agentId}</span>
        <Button
          variant='outline'
          size='sm'
          icon={isOnline ? LogOut : Trash2}
          loading={kicking}
          onClick={(e) => { e.stopPropagation(); onKick(agentId, action) }}
        >
          {isOnline ? 'Kick' : 'Remove'}
        </Button>
      </div>
    </Card>
  )
}

/* ── Metric Item ── */

function MetricItem ({ icon, label, value }) {
  return (
    <div style={s.metric}>
      <span style={{ opacity: 0.4 }}>{icon}</span>
      <span style={s.metricLabel}>{label}</span>
      <span style={s.metricValue}>{value}</span>
    </div>
  )
}

/* ── Styles ── */

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    animation: 'fadeIn 0.3s ease-out'
  },

  /* Stats */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12
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

  /* Agent grid */
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 12
  },

  /* Agent detail card */
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4
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
    fontFamily: "'Space Grotesk', sans-serif",
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  cardRole: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace"
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
    letterSpacing: '0.1em',
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif"
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    gap: 4,
    maskImage: 'linear-gradient(90deg, black 80%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(90deg, black 80%, transparent 100%)'
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
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
    width: 44,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600
  },
  cardInfoValue: {
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 11
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
    letterSpacing: '0.1em',
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif"
  },
  loadPct: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace"
  },

  /* Metrics row */
  metricsRow: {
    display: 'flex',
    gap: 16,
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    fontFamily: "'JetBrains Mono', monospace"
  },
  metric: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  metricLabel: {
    fontSize: 9,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
    fontFamily: "'Space Grotesk', sans-serif"
  },
  metricValue: {
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11
  },

  /* Offline notice */
  offlineNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 2,
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)'
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
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace"
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
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: 'var(--color-primary)',
    opacity: 0.6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 220
  }
}
