import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTaskStore } from '../stores/tasks'
import { useSessionStore } from '../stores/sessions'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import {
  Card, Button, Badge, StatCard, PageHeader, SectionHeader,
  SearchInput, FilterSelect
} from '../components/ui'
import { TaskSubmit } from '../components/task/TaskSubmit'
import { formatDuration } from '../utils/format'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import {
  ListTodo, Clock, CheckCircle2, XCircle, Eye, X,
  ArrowUpDown, Loader2, Filter
} from 'lucide-react'

const STAT_CONFIGS = [
  { key: 'pending', label: 'Pending', Icon: Clock, accentColor: 'var(--color-info)' },
  { key: 'running', label: 'Running', Icon: Loader2, accentColor: 'var(--color-warning)' },
  { key: 'success', label: 'Completed', Icon: CheckCircle2, accentColor: 'var(--color-success)' },
  { key: 'failure', label: 'Failed', Icon: XCircle, accentColor: 'var(--color-error)' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  ...['pending', 'running', 'success', 'failure', 'partial', 'cancelled'].map((s) => ({
    value: s,
    label: STATUS_LABELS[s] || s,
  })),
]

export function Tasks () {
  const tasks = useTaskStore((s) => s.tasks)
  const taskStats = useTaskStore((s) => s.taskStats)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)
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
    <div style={s.page}>
      <PageHeader
        title='Tasks'
        count={total}
      />

      {/* Stat cards — clickable for filtering */}
      <div style={s.statsRow}>
        {STAT_CONFIGS.map((cfg, i) => (
          <div
            key={cfg.key}
            style={{ ...s.statItem, animationDelay: `${i * 40}ms` }}
          >
            <StatCard
              icon={<cfg.Icon size={18} />}
              label={cfg.label}
              value={taskStats[cfg.key] || 0}
              accentColor={cfg.accentColor}
              active={statusFilter === cfg.key}
              onClick={() => setStatusFilter(statusFilter === cfg.key ? 'all' : cfg.key)}
            />
          </div>
        ))}
      </div>

      {/* Quick submit */}
      <div style={{ ...s.submitWrap, animationDelay: '160ms' }}>
        <TaskSubmit />
      </div>

      {/* Toolbar */}
      <div style={{ ...s.toolbar, animationDelay: '200ms' }}>
        <div style={s.filterGroup}>
          <FilterSelect
            icon={Filter}
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
          />
          {statusFilter !== 'all' && (
            <Button
              variant='ghost'
              size='sm'
              icon={X}
              onClick={() => setStatusFilter('all')}
            >
              Clear
            </Button>
          )}
        </div>
        <div style={s.searchWrap}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder='Search task ID or description...'
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ ...s.tableWrap, animationDelay: '240ms' }}>
        {filtered.length === 0 ? (
          <Card>
            <div style={s.emptyInner}>
              <ListTodo size={32} strokeWidth={1.5} style={{ opacity: 0.4, color: 'var(--color-text-muted)' }} />
              <span style={s.emptyTitle}>
                {tasks.length === 0 ? 'No tasks yet' : 'No matching tasks'}
              </span>
              <span style={s.emptyDesc}>
                {tasks.length === 0 ? 'Submit a task to see it appear here' : 'Try adjusting your filters'}
              </span>
            </div>
          </Card>
        ) : (
          <Card padding='sm'>
            <table style={s.table}>
              <thead>
                <tr>
                  <Th label='Task ID' field='taskId' sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label='Description' field='description' sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Progress</th>
                  <Th label='Duration' field='startedAt' sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task, i) => (
                  <TaskRow
                    key={task.taskId}
                    task={task}
                    index={i}
                    cancelling={cancelling === task.taskId}
                    onCancel={handleCancel}
                    onDetail={() => navigate(`/tasks/${task.taskId}`)}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}

function Th ({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field
  return (
    <th style={s.th} onClick={() => onSort(field)}>
      <button style={s.thBtn}>
        {label}
        <ArrowUpDown
          size={11}
          style={{
            color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
            opacity: active ? 1 : 0.4,
            transform: active && sortDir === 'asc' ? 'scaleY(-1)' : undefined,
            transition: 'all 0.15s',
          }}
        />
      </button>
    </th>
  )
}

function TaskRow ({ task, index, cancelling, onCancel, onDetail }) {
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

  return (
    <tr
      style={{
        ...s.tr,
        animationDelay: `${(index + 6) * 30}ms`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <td style={s.td}>
        <span style={s.taskId} title={task.taskId}>
          {task.taskId}
        </span>
      </td>
      <td style={s.td}>
        <span style={s.desc} title={task.request?.description}>
          {task.request?.description || '-'}
        </span>
      </td>
      <td style={s.td}>
        <span style={s.statusCell}>
          <StatusDot status={status} size='sm' pulse={status === 'running'} />
          <Badge
            variant='status'
            color={statusColor}
            pulse={status === 'running'}
          >
            {STATUS_LABELS[status] || status}
          </Badge>
        </span>
      </td>
      <td style={s.td}>
        <span style={s.progressCell}>
          <div style={s.progressTrack}>
            <div
              style={{
                ...s.progressFill,
                width: `${progressPct}%`,
                backgroundColor: statusColor,
                boxShadow: status === 'running' ? `0 0 8px ${statusColor}44` : undefined,
              }}
            />
          </div>
          <span style={s.progressLabel}>{completedSteps}/{totalSteps}</span>
        </span>
      </td>
      <td style={{ ...s.td, ...s.mono }}>
        {duration != null ? formatDuration(duration) : '-'}
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        <span style={s.actions}>
          <Button
            variant='outline'
            size='sm'
            icon={Eye}
            onClick={onDetail}
          >
            Detail
          </Button>
          {isActive && (
            <Button
              variant='ghost'
              size='sm'
              icon={cancelling ? Loader2 : X}
              loading={cancelling}
              onClick={() => onCancel(task.taskId)}
            >
              Cancel
            </Button>
          )}
        </span>
      </td>
    </tr>
  )
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },

  /* Stats */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
  },
  statItem: {
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },

  /* Submit wrapper */
  submitWrap: {
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },

  /* Toolbar */
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    minWidth: 200,
    maxWidth: 360,
  },

  /* Table */
  tableWrap: {
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    borderBottom: '2px solid var(--color-border)',
    background: 'color-mix(in srgb, var(--color-surface) 92%, black)',
    whiteSpace: 'nowrap',
  },
  thBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 'inherit',
    fontWeight: 'inherit',
    fontFamily: 'inherit',
    color: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  },
  tr: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background 0.15s',
    animation: 'fadeIn 0.3s var(--ease-out) both',
  },
  td: {
    padding: '12px 14px',
    fontSize: 13,
    fontFamily: "'Space Grotesk', sans-serif",
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--color-border)',
  },
  mono: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: 'var(--color-text-secondary)',
  },
  taskId: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-primary)',
    maxWidth: 140,
    display: 'inline-block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  desc: {
    display: 'inline-block',
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  statusCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    whiteSpace: 'nowrap',
  },
  progressCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
  },
  progressTrack: {
    width: 60,
    height: 4,
    borderRadius: 0,
    background: 'var(--color-load-track)',
    overflow: 'hidden',
    border: '1px solid var(--color-border)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 0,
    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  progressLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: 'var(--color-text-muted)',
    minWidth: 24,
  },
  actions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },

  /* Empty */
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
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text-muted)',
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text-muted)',
    opacity: 0.7,
  },
}
