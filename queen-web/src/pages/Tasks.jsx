import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTaskStore } from '../stores/tasks'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import { EmptyState } from '../components/common/EmptyState'
import { formatDuration } from '../utils/format'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import {
  ListTodo, Clock, CheckCircle2, XCircle, Loader2,
  Search, Filter, Eye, X, ChevronDown, ArrowUpDown
} from 'lucide-react'
import { TaskSubmit } from '../components/task/TaskSubmit'

const STAT_CONFIGS = [
  { key: 'pending', label: 'Pending', icon: Clock, color: 'var(--color-info)', dim: 'var(--color-info-dim)' },
  { key: 'running', label: 'Running', icon: Loader2, color: 'var(--color-warning)', dim: 'var(--color-warning-dim)' },
  { key: 'success', label: 'Completed', icon: CheckCircle2, color: 'var(--color-success)', dim: 'var(--color-success-dim)' },
  { key: 'failure', label: 'Failed', icon: XCircle, color: 'var(--color-error)', dim: 'var(--color-error-dim)' }
]

const STATUS_OPTIONS = ['all', 'pending', 'running', 'success', 'failure', 'partial', 'cancelled']

export function Tasks () {
  const tasks = useTaskStore((s) => s.tasks)
  const taskStats = useTaskStore((s) => s.taskStats)
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [cancelling, setCancelling] = useState(null)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = useMemo(() => {
    let list = tasks
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) =>
        t.taskId?.toLowerCase().includes(q) ||
        t.request?.description?.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let va = a[sortField]
      let vb = b[sortField]
      if (sortField === 'description') {
        va = a.request?.description ?? ''
        vb = b.request?.description ?? ''
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0)
    })
    return list
  }, [tasks, statusFilter, search, sortField, sortDir])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const handleCancel = async (taskId) => {
    if (!window.confirm(`Cancel task ${taskId}?`)) return
    setCancelling(taskId)
    try {
      await apiFetch(`/task/${taskId}`, { method: 'DELETE' })
    } catch (err) {
      alert(`Cancel failed: ${err.message}`)
    } finally {
      setCancelling(null)
    }
  }

  const total = tasks.length

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.sectionTitle}>
        <span style={styles.sectionTitleText}>Tasks</span>
        <span style={styles.countBadge}>{total}</span>
        <div style={styles.titleLine} />
      </div>

      {/* Stat cards */}
      <div style={styles.statsRow}>
        {STAT_CONFIGS.map((cfg) => (
          <StatCard
            key={cfg.key}
            {...cfg}
            value={taskStats[cfg.key] || 0}
            active={statusFilter === cfg.key}
            onClick={() => setStatusFilter(statusFilter === cfg.key ? 'all' : cfg.key)}
          />
        ))}
      </div>

      {/* Quick submit */}
      <TaskSubmit />

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <div style={styles.selectWrap}>
            <Filter size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
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
          {statusFilter !== 'all' && (
            <button style={styles.clearBtn} onClick={() => setStatusFilter('all')}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
        <div style={styles.searchWrap}>
          <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            type='text'
            placeholder='Search task ID or description...'
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={styles.tableCard}>
          <EmptyState
            icon={ListTodo}
            title={tasks.length === 0 ? 'No tasks yet' : 'No matching tasks'}
            description={tasks.length === 0 ? 'Submit a task to see it appear here' : 'Try adjusting your filters'}
          />
        </div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr>
                <Th label='Task ID' field='taskId' sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th label='Description' field='description' sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Progress</th>
                <Th label='Duration' field='startedAt' sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th style={styles.th}>Agent</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <TaskRow
                  key={task.taskId}
                  task={task}
                  cancelling={cancelling === task.taskId}
                  onCancel={handleCancel}
                  onDetail={() => navigate(`/tasks/${task.taskId}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard ({ icon: Icon, label, value, color, dim, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.statCard,
        borderColor: active ? color : 'var(--color-border)',
        borderLeftColor: color,
        background: active ? dim : 'var(--color-surface)',
        cursor: 'pointer'
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

function Th ({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field
  return (
    <th style={styles.th} onClick={() => onSort(field)}>
      <button style={styles.thBtn}>
        {label}
        <ArrowUpDown
          size={11}
          style={{
            color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
            opacity: active ? 1 : 0.4,
            transform: active && sortDir === 'asc' ? 'scaleY(-1)' : undefined,
            transition: 'all 0.15s'
          }}
        />
      </button>
    </th>
  )
}

function TaskRow ({ task, cancelling, onCancel, onDetail }) {
  const status = task.status || 'pending'
  const statusColor = TASK_STATUS_COLORS[status] || '#6b7280'
  const results = task.results || []
  const steps = task.steps || []
  const completedSteps = results.filter((r) => r.status === 'success').length
  const totalSteps = steps.length || 1
  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  const isActive = status === 'running' || status === 'pending'

  const duration = task.startedAt
    ? (task.finishedAt || Date.now()) - task.startedAt
    : null

  const agentId = results.find((r) => r.agentId)?.agentId ||
    (task.steps?.[0]?.capability) || '-'

  return (
    <tr
      style={styles.tr}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <td style={styles.td}>
        <span style={styles.taskId} title={task.taskId}>
          {task.taskId}
        </span>
      </td>
      <td style={styles.td}>
        <span style={styles.desc} title={task.request?.description}>
          {task.request?.description || '-'}
        </span>
      </td>
      <td style={styles.td}>
        <span style={styles.statusCell}>
          <StatusDot status={status} size='sm' pulse={status === 'running'} />
          <span style={{ ...styles.statusLabel, color: statusColor }}>
            {STATUS_LABELS[status] || status}
          </span>
        </span>
      </td>
      <td style={styles.td}>
        <span style={styles.progressCell}>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPct}%`,
                backgroundColor: statusColor,
                boxShadow: status === 'running' ? `0 0 8px ${statusColor}44` : undefined
              }}
            />
          </div>
          <span style={styles.progressLabel}>{completedSteps}/{totalSteps}</span>
        </span>
      </td>
      <td style={{ ...styles.td, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {duration != null ? formatDuration(duration) : '-'}
      </td>
      <td style={styles.td}>
        <span style={styles.agentId} title={agentId}>
          {agentId}
        </span>
      </td>
      <td style={{ ...styles.td, textAlign: 'right' }}>
        <span style={styles.actions}>
          <button
            onClick={onDetail}
            style={styles.detailBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
          >
            <Eye size={13} />
            Detail
          </button>
          {isActive && (
            <button
              onClick={() => onCancel(task.taskId)}
              disabled={cancelling}
              style={{
                ...styles.cancelBtn,
                opacity: cancelling ? 0.5 : 1
              }}
              onMouseEnter={(e) => { if (!cancelling) e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.borderColor = 'var(--color-error)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              {cancelling ? <Loader2 size={13} /> : <X size={13} />}
              Cancel
            </button>
          )}
        </span>
      </td>
    </tr>
  )
}

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
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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

  /* Table card */
  tableCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface-hover)',
    whiteSpace: 'nowrap'
  },
  thBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 'inherit',
    fontWeight: 'inherit',
    color: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
    cursor: 'pointer'
  },
  tr: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background 0.15s'
  },
  td: {
    padding: '12px 14px',
    fontSize: 13,
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--color-border)'
  },
  taskId: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-primary)',
    maxWidth: 140,
    display: 'inline-block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  desc: {
    display: 'inline-block',
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)'
  },
  statusCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    whiteSpace: 'nowrap'
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.01em'
  },
  progressCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap'
  },
  progressTrack: {
    width: 60,
    height: 4,
    borderRadius: 2,
    background: 'var(--color-load-track)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  progressLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: 'var(--color-text-muted)',
    minWidth: 24
  },
  agentId: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    maxWidth: 120,
    display: 'inline-block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  actions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6
  },
  detailBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    transition: 'all 0.15s'
  },
  cancelBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    transition: 'all 0.15s'
  }
}
