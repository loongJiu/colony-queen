/**
 * Sessions -- 工作会话列表页面
 *
 * 展示所有工作会话及其关联的任务列表，
 * 支持展开/折叠查看会话下的任务详情。
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../stores/sessions'
import { SessionCreateDialog } from '../components/session/SessionCreateDialog'
import { StatusDot } from '../components/common/StatusDot'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import { formatTimeAgo } from '../utils/format'
import {
  Card, Button, Badge, StatCard, PageHeader, SectionHeader, Skeleton
} from '../components/ui'
import {
  FolderTree, ChevronRight, ChevronDown, ListTodo,
  Clock, Loader2, Inbox, Plus, Zap
} from 'lucide-react'

export function Sessions () {
  const sessions = useSessionStore((s) => s.sessions)
  const loading = useSessionStore((s) => s.loading)
  const createDialogOpen = useSessionStore((s) => s.createDialogOpen)
  const fetchSessions = useSessionStore((s) => s.fetchSessions)
  const openCreateDialog = useSessionStore((s) => s.openCreateDialog)
  const closeCreateDialog = useSessionStore((s) => s.closeCreateDialog)
  const createSession = useSessionStore((s) => s.createSession)
  const [expanded, setExpanded] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    fetchSessions()
  }, [])

  const toggleExpand = (sessionId) => {
    setExpanded((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }))
  }

  const handleCreated = (data) => {
    // Session store already handles state update via createSession
    if (data?.sessionId) {
      setExpanded((prev) => ({ ...prev, [data.sessionId]: true }))
    }
  }

  return (
    <div style={s.page}>
      <PageHeader
        title='Work Sessions'
        count={sessions.length}
        actions={
          <Button
            variant='primary'
            size='sm'
            icon={Plus}
            onClick={openCreateDialog}
          >
            New Session
          </Button>
        }
      />

      <SessionCreateDialog
        open={createDialogOpen}
        onClose={closeCreateDialog}
        onCreated={handleCreated}
      />

      {/* Loading skeleton */}
      {loading && sessions.length === 0 ? (
        <div style={s.skeletonList}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton
              key={i}
              variant='rect'
              height={64}
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        /* Empty state */
        <Card style={s.emptyCard}>
          <div style={s.emptyInner}>
            <div style={s.emptyIconWrap}>
              <Inbox size={28} strokeWidth={1.5} style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
            </div>
            <span style={s.emptyTitle}>No sessions yet</span>
            <span style={s.emptyDesc}>
              Create a work session to group related tasks together
            </span>
            <Button
              variant='primary'
              size='md'
              icon={Plus}
              onClick={openCreateDialog}
              style={{ marginTop: 8 }}
            >
              Create First Session
            </Button>
          </div>
        </Card>
      ) : (
        /* Session list */
        <div style={s.sessionList}>
          {sessions.map((session, i) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              index={i}
              isOpen={expanded[session.sessionId]}
              onToggle={() => toggleExpand(session.sessionId)}
              onTaskClick={(taskId) => navigate(`/tasks/${taskId}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard ({ session, index, isOpen, onToggle, onTaskClick }) {
  const tasks = session.tasks || []
  const completedCount = tasks.filter((t) => t.status === 'success').length
  const isActive = session.status === 'active'
  const isArchived = session.status === 'archived'

  return (
    <div
      style={{
        ...s.sessionCard,
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Session header */}
      <div
        style={s.sessionHeader}
        onClick={onToggle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <div style={s.sessionLeft}>
          <div style={{
            ...s.chevron,
            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}>
            <ChevronDown size={14} />
          </div>
          <FolderTree size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <div style={s.sessionInfo}>
            <div style={s.sessionNameRow}>
              <span style={s.sessionName}>{session.name || session.title || session.sessionId}</span>
              {isActive && (
                <Badge variant='status' color='var(--color-success)' pulse>
                  active
                </Badge>
              )}
              {isArchived && (
                <Badge variant='status' color='var(--color-text-muted)'>
                  archived
                </Badge>
              )}
            </div>
            <span style={s.sessionMeta}>
              {tasks.length} task{tasks.length !== 1 ? 's' : ''} &middot; {completedCount} completed
            </span>
          </div>
        </div>
        <div style={s.sessionRight}>
          {session.createdAt && (
            <span style={s.sessionTime}>
              <Clock size={10} style={{ opacity: 0.4 }} />
              {formatTimeAgo(session.createdAt)}
            </span>
          )}
        </div>
      </div>

      {/* Expanded tasks with height transition */}
      <div style={{
        ...s.taskListWrap,
        maxHeight: isOpen ? 600 : 0,
        opacity: isOpen ? 1 : 0,
      }}>
        <div style={s.taskList}>
          {tasks.length > 0 ? (
            tasks.map((task) => {
              const status = task.status || 'pending'
              const color = TASK_STATUS_COLORS[status] || '#6b7280'
              return (
                <div
                  key={task.taskId}
                  style={s.taskRow}
                  onClick={() => onTaskClick(task.taskId)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = color + '55'
                    e.currentTarget.style.background = 'var(--color-surface-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.background = 'var(--color-surface)'
                  }}
                >
                  <div style={s.taskLeft}>
                    <StatusDot status={status} size='sm' pulse={status === 'running'} />
                    <span style={s.taskDesc}>{task.request?.description || task.taskId}</span>
                  </div>
                  <div style={s.taskRight}>
                    <Badge variant='status' color={color}>
                      {STATUS_LABELS[status]}
                    </Badge>
                  </div>
                </div>
              )
            })
          ) : (
            <div style={s.emptyTasks}>
              <span style={s.emptyTasksText}>No tasks in this session</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  /* Skeleton */
  skeletonList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  /* Empty state */
  emptyCard: {
    animation: 'fadeIn 0.4s var(--ease-out) both',
    borderRadius: '2px',
  },
  emptyInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: 10,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: '2px',
    background: 'var(--color-primary-dim)',
    border: '1px solid var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text)',
    fontFamily: "'Space Grotesk', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  emptyDesc: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    maxWidth: 300,
    fontFamily: "'JetBrains Mono', monospace",
  },

  /* Session list */
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sessionCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '2px',
    overflow: 'hidden',
    animation: 'fadeIn 0.4s var(--ease-out) both',
  },
  sessionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    cursor: 'pointer',
    transition: 'background var(--duration-fast) var(--ease-default)',
  },
  sessionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  chevron: {
    color: 'var(--color-text-muted)',
    flexShrink: 0,
    transition: 'transform var(--duration-fast) var(--ease-default)',
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  sessionNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sessionName: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontFamily: "'Space Grotesk', sans-serif",
  },
  sessionMeta: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  sessionRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  sessionTime: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },

  /* Task list with height transition */
  taskListWrap: {
    overflow: 'hidden',
    transition: 'max-height 0.3s var(--ease-default), opacity 0.25s var(--ease-default)',
  },
  taskList: {
    borderTop: '1px solid var(--color-border)',
    borderLeft: '3px solid var(--color-primary)',
    padding: '2px 0',
    background: 'var(--color-surface)',
  },
  taskRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px 8px 40px',
    cursor: 'pointer',
    transition: 'all var(--duration-fast) var(--ease-default)',
    borderLeft: '2px solid transparent',
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
  },
  taskLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  taskDesc: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: "'JetBrains Mono', monospace",
  },
  taskRight: {
    flexShrink: 0,
  },
  emptyTasks: {
    padding: '10px 14px 10px 40px',
  },
  emptyTasksText: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontFamily: "'Space Grotesk', sans-serif",
  },
}
