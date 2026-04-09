/**
 * Sessions — 工作会话列表页面
 *
 * 展示所有工作会话及其关联的任务列表，
 * 支持展开/折叠查看会话下的任务详情。
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../stores/sessions'
import { StatusDot } from '../components/common/StatusDot'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import { formatTimeAgo } from '../utils/format'
import {
  FolderTree, ChevronRight, ChevronDown, ListTodo,
  Clock, Loader2, Inbox
} from 'lucide-react'

export function Sessions () {
  const sessions = useSessionStore((s) => s.sessions)
  const loading = useSessionStore((s) => s.loading)
  const fetchSessions = useSessionStore((s) => s.fetchSessions)
  const [expanded, setExpanded] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    fetchSessions()
  }, [])

  const toggleExpand = (sessionId) => {
    setExpanded((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }))
  }

  if (loading && sessions.length === 0) {
    return (
      <div style={s.loadingWrap}>
        <Loader2 size={24} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
        <span style={s.loadingText}>Loading sessions...</span>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Section title */}
      <div style={s.sectionTitle}>
        <span style={s.sectionTitleText}>Work Sessions</span>
        <div style={s.titleLine} />
      </div>

      {sessions.length === 0 ? (
        <div style={s.emptyWrap}>
          <Inbox size={20} style={{ color: 'var(--color-text-muted)', opacity: 0.3 }} />
          <span style={s.emptyText}>No sessions yet</span>
        </div>
      ) : (
        <div style={s.sessionList}>
          {sessions.map((session) => {
            const isOpen = expanded[session.sessionId]
            const tasks = session.tasks || []
            const completedCount = tasks.filter((t) => t.status === 'success').length

            return (
              <div key={session.sessionId} style={s.sessionCard}>
                {/* Session header */}
                <div
                  style={s.sessionHeader}
                  onClick={() => toggleExpand(session.sessionId)}
                >
                  <div style={s.sessionLeft}>
                    {isOpen
                      ? <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                      : <ChevronRight size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    }
                    <FolderTree size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div style={s.sessionInfo}>
                      <span style={s.sessionName}>{session.name || session.sessionId}</span>
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

                {/* Expanded tasks */}
                {isOpen && tasks.length > 0 && (
                  <div style={s.taskList}>
                    {tasks.map((task) => {
                      const status = task.status || 'pending'
                      const color = TASK_STATUS_COLORS[status] || '#6b7280'
                      return (
                        <div
                          key={task.taskId}
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
                          <div style={s.taskLeft}>
                            <StatusDot status={status} size='sm' pulse={status === 'running'} />
                            <span style={s.taskDesc}>{task.request?.description || task.taskId}</span>
                          </div>
                          <div style={s.taskRight}>
                            <span style={{ ...s.taskStatus, color }}>{STATUS_LABELS[status]}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {isOpen && tasks.length === 0 && (
                  <div style={s.emptyTasks}>
                    <span style={s.emptyTasksText}>No tasks in this session</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    animation: 'fadeIn 0.3s ease-out'
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  sectionTitleText: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    whiteSpace: 'nowrap'
  },
  titleLine: {
    flex: 1,
    height: 1,
    background: 'linear-gradient(90deg, var(--color-border), transparent)'
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

  /* Empty */
  emptyWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '24px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--color-text-muted)'
  },

  /* Session list */
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  sessionCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden'
  },
  sessionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  sessionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0
  },
  sessionName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  sessionMeta: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
  },
  sessionRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0
  },
  sessionTime: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
  },

  /* Tasks */
  taskList: {
    borderTop: '1px solid var(--color-border)',
    padding: '4px 0'
  },
  taskRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px 10px 44px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    borderLeft: '2px solid transparent'
  },
  taskLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  taskDesc: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  taskRight: {
    flexShrink: 0
  },
  taskStatus: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontFamily: "'IBM Plex Mono', monospace"
  },
  emptyTasks: {
    padding: '12px 16px 12px 44px',
    borderTop: '1px solid var(--color-border)'
  },
  emptyTasksText: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontStyle: 'italic'
  }
}
