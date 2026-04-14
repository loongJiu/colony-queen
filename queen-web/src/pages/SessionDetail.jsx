/**
 * SessionDetail — 工作会话详情页面
 *
 * 展示单个会话的完整信息：标题、状态、关联任务、共享上下文。
 * 从 useSessionStore.fetchSessionDetail(sessionId) 获取数据。
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../stores/sessions'
import { useTaskStore } from '../stores/tasks'
import { PageHeader, SectionHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/ui/StatCard'
import { StatusDot } from '../components/common/StatusDot'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import { formatTimeAgo } from '../utils/format'
import {
  FolderTree, ListTodo, Archive, Clock,
  Loader2, Inbox, ArrowLeft, FileText
} from 'lucide-react'

const SESSION_STATUS_COLORS = {
  active: 'var(--color-success)',
  archived: 'var(--color-text-muted)',
  completed: 'var(--color-info)',
}

export function SessionDetail () {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const fetchSessionDetail = useSessionStore((s) => s.fetchSessionDetail)
  const archiveSession = useSessionStore((s) => s.archiveSession)
  const tasks = useTaskStore((s) => s.tasks)

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load () {
      setLoading(true)
      const data = await fetchSessionDetail(sessionId)
      if (!cancelled) {
        setSession(data)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  if (loading) {
    return (
      <div style={s.loadingWrap}>
        <Loader2 size={24} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
        <span style={s.loadingText}>Loading session...</span>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={s.emptyWrap}>
        <Inbox size={20} style={{ color: 'var(--color-text-muted)', opacity: 0.3 }} />
        <span style={s.emptyText}>Session not found</span>
        <Button variant='ghost' size='sm' icon={ArrowLeft} onClick={() => navigate('/sessions')}>
          Back to Sessions
        </Button>
      </div>
    )
  }

  const sessionTitle = session.title || session.name || session.sessionId
  const status = session.status || 'active'
  const statusColor = SESSION_STATUS_COLORS[status] || 'var(--color-text-muted)'
  const conversationIds = session.conversationIds || []
  const sharedContext = session.sharedContext || {}
  const contextKeys = Object.keys(sharedContext)

  // 匹配关联任务
  const relatedTasks = conversationIds.length > 0 && tasks && tasks.length > 0
    ? conversationIds
        .map((id) => tasks.find((t) => t.taskId === id))
        .filter(Boolean)
    : (session.tasks || [])

  const completedCount = relatedTasks.filter((t) => t.status === 'success').length
  const isArchived = status === 'archived'

  const handleArchive = async () => {
    setArchiving(true)
    await archiveSession(sessionId)
    setSession((prev) => ({ ...prev, status: 'archived' }))
    setArchiving(false)
  }

  return (
    <div style={s.page}>
      {/* Page Header */}
      <PageHeader
        title={sessionTitle}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant='ghost'
              size='sm'
              icon={ArrowLeft}
              onClick={() => navigate('/sessions')}
            >
              Sessions
            </Button>
            {!isArchived && (
              <Button
                variant='outline'
                size='sm'
                icon={Archive}
                loading={archiving}
                onClick={handleArchive}
              >
                Archive
              </Button>
            )}
          </div>
        }
      />

      {/* Hero 区域 */}
      <Card style={s.heroCard}>
        <div style={s.heroTop}>
          <div style={s.heroLeft}>
            <FolderTree size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div style={s.heroInfo}>
              <span style={s.heroTitle}>{sessionTitle}</span>
              <div style={s.heroMeta}>
                {session.createdAt && (
                  <span style={s.heroTime}>
                    <Clock size={10} style={{ opacity: 0.5 }} />
                    {formatTimeAgo(session.createdAt)}
                  </span>
                )}
                <span style={s.heroId}>{sessionId}</span>
              </div>
            </div>
          </div>
          <Badge
            variant='status'
            status={status}
            color={statusColor}
            pulse={status === 'active'}
          >
            {STATUS_LABELS[status] || status}
          </Badge>
        </div>
      </Card>

      {/* 统计卡片 */}
      <div style={s.statsRow}>
        <StatCard
          icon={ListTodo}
          label='Total Tasks'
          value={relatedTasks.length}
          accentColor='var(--color-primary)'
        />
        <StatCard
          icon={() => <span style={{ fontSize: 14, fontWeight: 700 }}>&#10003;</span>}
          label='Completed'
          value={completedCount}
          accentColor='var(--color-success)'
        />
        <StatCard
          icon={FileText}
          label='Shared Context'
          value={contextKeys.length}
          accentColor='var(--color-info)'
        />
      </div>

      {/* 关联任务列表 */}
      <SectionHeader title='Related Tasks' sub={`${relatedTasks.length} task${relatedTasks.length !== 1 ? 's' : ''}`} />
      {relatedTasks.length === 0 ? (
        <Card padding='md'>
          <div style={s.emptySection}>
            <Inbox size={16} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
            <span style={s.emptySectionText}>No tasks in this session</span>
          </div>
        </Card>
      ) : (
        <div style={s.taskList}>
          {relatedTasks.map((task) => {
            const taskStatus = task.status || 'pending'
            const color = TASK_STATUS_COLORS[taskStatus] || '#6b7280'
            return (
              <Card
                key={task.taskId}
                hoverable
                padding='sm'
                borderColor='var(--color-border)'
                onClick={() => navigate(`/tasks/${task.taskId}`)}
              >
                <div style={s.taskRow}>
                  <div style={s.taskLeft}>
                    <StatusDot status={taskStatus} size='sm' pulse={taskStatus === 'running'} />
                    <span style={s.taskDesc}>
                      {task.request?.description || task.taskId}
                    </span>
                  </div>
                  <Badge variant='status' status={taskStatus}>
                    {STATUS_LABELS[taskStatus]}
                  </Badge>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* 共享上下文 */}
      {contextKeys.length > 0 && (
        <>
          <SectionHeader title='Shared Context' sub={`${contextKeys.length} key${contextKeys.length !== 1 ? 's' : ''}`} style={{ marginTop: 8 }} />
          <Card padding='md'>
            <div style={s.contextGrid}>
              {contextKeys.map((key) => (
                <div key={key} style={s.contextItem}>
                  <span style={s.contextKey}>{key}</span>
                  <span style={s.contextValue}>
                    {typeof sharedContext[key] === 'object'
                      ? JSON.stringify(sharedContext[key], null, 2)
                      : String(sharedContext[key])}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 300,
    color: 'var(--color-text-muted)'
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--color-text-muted)'
  },

  /* Hero */
  heroCard: {
    padding: 20,
  },
  heroTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  heroInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  heroMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroTime: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  heroId: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    opacity: 0.6,
  },

  /* Stats */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },

  /* Task list */
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  taskRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  taskDesc: {
    fontSize: 13,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  /* Empty section */
  emptySection: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  emptySectionText: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },

  /* Shared context */
  contextGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  contextItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  contextKey: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  contextValue: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    lineHeight: 1.5,
    padding: '8px 12px',
    background: 'var(--color-surface-hover)',
    borderRadius: 'var(--radius-sm)',
  },
}
