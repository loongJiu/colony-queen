import { StatusDot } from '../common/StatusDot'
import { LoadBar } from '../common/LoadBar'
import { STATUS_LABELS } from '../../utils/constants'
import { formatTimeAgo, formatPercent } from '../../utils/format'
import { Cpu, Activity } from 'lucide-react'

export function AgentCard ({ agent, onClick }) {
  const {
    agentId,
    name,
    status = 'offline',
    load = 0,
    activeTasks = 0,
    capabilities = [],
    lastHeartbeat
  } = agent

  return (
    <div
      style={{ ...styles.card, cursor: onClick ? 'pointer' : 'default' }}
      data-status={status}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'var(--color-primary)44'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.transform = 'none'
        }
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.nameRow}>
          <StatusDot status={status} size='md' pulse={status === 'busy'} />
          <span style={styles.agentName}>{name || agentId}</span>
        </div>
        <span style={{ ...styles.statusBadge, color: `var(--color-${status === 'busy' ? 'warning' : status === 'error' ? 'error' : status === 'offline' ? 'text-muted' : 'idle'})` }}>
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      {/* Load */}
      <div style={styles.loadSection}>
        <div style={styles.loadLabel}>
          <Cpu size={11} style={{ opacity: 0.5 }} />
          <span>Load {formatPercent(load)}</span>
        </div>
        <LoadBar value={load} status={status} />
      </div>

      {/* Metrics */}
      <div style={styles.metrics}>
        <div style={styles.metric}>
          <Activity size={11} style={{ opacity: 0.5 }} />
          <span>{activeTasks} task{activeTasks !== 1 ? 's' : ''}</span>
        </div>
        <div style={styles.metric}>
          <span style={{ opacity: 0.5 }}>last</span>
          <span>{formatTimeAgo(lastHeartbeat)}</span>
        </div>
      </div>

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div style={styles.capabilities}>
          {capabilities.map((cap) => (
            <span key={typeof cap === 'string' ? cap : cap.capability} style={styles.cap}>
              {typeof cap === 'string' ? cap : cap.capability}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
    cursor: 'default',
    position: 'relative',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0
  },
  agentName: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0
  },
  loadSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  loadLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    fontFamily: "'JetBrains Mono', monospace"
  },
  metrics: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    fontFamily: "'JetBrains Mono', monospace"
  },
  metric: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  capabilities: {
    display: 'flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    gap: 4,
    maskImage: 'linear-gradient(90deg, black 80%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(90deg, black 80%, transparent 100%)'
  },
  cap: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'var(--color-primary-dim)',
    color: 'var(--color-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.01em'
  }
}
