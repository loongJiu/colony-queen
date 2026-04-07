import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTaskStore } from '../stores/tasks'
import { apiFetch } from '../api/client'
import { StatusDot } from '../components/common/StatusDot'
import { TaskFlow } from '../components/task/TaskFlow'
import { TaskLogPanel } from '../components/task/TaskLogPanel'
import { formatDuration } from '../utils/format'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import {
  ArrowLeft, XCircle, Clock, Loader2, CheckCircle2, XCircle as FailIcon,
  Layers, Brain, FileText, Network
} from 'lucide-react'

export function TaskDetail () {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const storeTask = useTaskStore((s) => s.tasks.find((t) => t.taskId === taskId))
  const selectedTask = useTaskStore((s) => s.selectedTask)
  const logs = useTaskStore((s) => s.taskLogs[taskId] || [])
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)

  const [loading, setLoading] = useState(!storeTask)
  const [error, setError] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  // Fetch full task details via API if not in store
  useEffect(() => {
    if (storeTask?.results?.length > 0) {
      setSelectedTask(storeTask)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    apiFetch(`/task/${taskId}`)
      .then((data) => {
        if (!cancelled) {
          setSelectedTask(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [taskId])

  const task = selectedTask || storeTask

  const handleCancel = async () => {
    if (!window.confirm(`Cancel task ${taskId}?`)) return
    setCancelling(true)
    try {
      await apiFetch(`/task/${taskId}`, { method: 'DELETE' })
    } catch (err) {
      alert(`Cancel failed: ${err.message}`)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <Loader2 size={24} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
        <span style={styles.loadingText}>Loading task details...</span>
        <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div style={styles.loadingWrap}>
        <FailIcon size={24} style={{ color: 'var(--color-error)' }} />
        <span style={styles.loadingText}>{error || 'Task not found'}</span>
        <button style={styles.backBtn} onClick={() => navigate('/tasks')}>
          <ArrowLeft size={14} /> Back to Tasks
        </button>
      </div>
    )
  }

  const status = task.status || 'pending'
  const statusColor = TASK_STATUS_COLORS[status] || '#6b7280'
  const isActive = status === 'running' || status === 'pending'
  const steps = task.steps || []
  const results = task.results || []
  const duration = task.startedAt ? (task.finishedAt || Date.now()) - task.startedAt : null
  const completedSteps = results.filter((r) => r.status === 'success').length
  const totalSteps = steps.length || 1

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <button style={styles.backBtn} onClick={() => navigate('/tasks')}>
          <ArrowLeft size={14} />
          <span>Tasks</span>
        </button>
      </div>

      {/* Task header */}
      <div style={styles.taskHeader}>
        <div style={styles.taskHeaderLeft}>
          <h1 style={styles.taskId}>{taskId}</h1>
          <span style={styles.statusBadge(statusColor)}>
            <StatusDot status={status} size='sm' pulse={status === 'running'} />
            {STATUS_LABELS[status] || status}
          </span>
        </div>
        {isActive && (
          <button
            style={styles.cancelMainBtn(cancelling)}
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 size={14} /> : <XCircle size={14} />}
            Cancel Task
          </button>
        )}
      </div>

      {/* Description */}
      {task.request?.description && (
        <p style={styles.description}>{task.request.description}</p>
      )}

      {/* Meta cards */}
      <div style={styles.metaRow}>
        <MetaCard icon={<Clock size={14} />} label='Duration' value={duration != null ? formatDuration(duration) : '-'} />
        <MetaCard icon={<Layers size={14} />} label='Progress' value={`${completedSteps} / ${totalSteps} steps`} />
        <MetaCard icon={<Network size={14} />} label='Strategy' value={task.strategy || 'single'} />
        {task.planInfo?.model && (
          <MetaCard icon={<Brain size={14} />} label='Planner' value={`${task.planInfo.model}${task.planInfo.degraded ? ' (fallback)' : ''}`} />
        )}
      </div>

      {/* Execution flow */}
      {steps.length > 0 && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>Execution Flow</span>
            <div style={styles.sectionLine} />
          </div>
          <TaskFlow steps={steps} results={results} />
        </section>
      )}

      {/* Real-time logs */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>
          <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
          <span style={styles.sectionTitleText}>Real-time Logs</span>
          <div style={styles.sectionLine} />
        </div>
        <TaskLogPanel logs={logs} maxHeight={300} />
      </section>

      {/* Step details */}
      {results.length > 0 && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>Step Results</span>
            <div style={styles.sectionLine} />
          </div>
          <div style={styles.stepGrid}>
            {steps.map((step, i) => {
              const result = results.find((r) => r.stepIndex === step.stepIndex || r.stepIndex === i)
              const stepStatus = result?.status || 'pending'
              const stepColor = TASK_STATUS_COLORS[stepStatus] || '#94a3b8'
              const stepDuration = result ? (result.finishedAt || Date.now()) - result.startedAt : null

              return (
                <div key={i} style={{ ...styles.stepCard, borderLeftColor: stepColor }}>
                  <div style={styles.stepCardHeader}>
                    <span style={styles.stepName}>
                      <StatusDot status={stepStatus} size='sm' pulse={stepStatus === 'running'} />
                      {step.name || step.description || `Step ${i + 1}`}
                    </span>
                    <span style={{ ...styles.stepStatus, color: stepColor }}>
                      {STATUS_LABELS[stepStatus] || stepStatus}
                    </span>
                  </div>
                  <div style={styles.stepMeta}>
                    <span style={styles.stepCapability}>{step.capability}</span>
                    {result?.agentId && (
                      <span style={styles.stepAgent}>Agent: {result.agentId}</span>
                    )}
                    {stepDuration != null && (
                      <span style={styles.stepDuration}>{formatDuration(stepDuration)}</span>
                    )}
                  </div>
                  {step.reasoning && (
                    <p style={styles.stepReasoning}>{step.reasoning}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* LLM Plan Info */}
      {task.planInfo && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <Brain size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>LLM Planning Details</span>
            <div style={styles.sectionLine} />
          </div>
          <div style={styles.planCard}>
            <div style={styles.planMetaRow}>
              <span style={styles.planMetaItem}>Model: <strong>{task.planInfo.model || '-'}</strong></span>
              <span style={styles.planMetaItem}>Duration: <strong>{task.planInfo.durationMs ? formatDuration(task.planInfo.durationMs) : '-'}</strong></span>
              <span style={styles.planMetaItem}>
                Fallback: <strong style={{ color: task.planInfo.degraded ? 'var(--color-error)' : 'var(--color-success)' }}>
                  {task.planInfo.degraded ? 'Yes' : 'No'}
                </strong>
              </span>
            </div>
            {task.planInfo.summary && (
              <p style={styles.planSummary}>{task.planInfo.summary}</p>
            )}
            {task.planInfo.steps?.length > 0 && (
              <div style={styles.planSteps}>
                <div style={styles.planStepsTitle}>Step Reasoning:</div>
                {task.planInfo.steps.map((s, i) => (
                  <div key={i} style={styles.planStepRow}>
                    <span style={styles.planStepId}>{s.stepId || `s${i + 1}`}</span>
                    <span style={styles.planStepText}>{s.reasoning || s.name || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function MetaCard ({ icon, label, value }) {
  return (
    <div style={styles.metaCard}>
      <div style={styles.metaIcon}>{icon}</div>
      <div>
        <div style={styles.metaLabel}>{label}</div>
        <div style={styles.metaValue}>{value}</div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
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

  /* Task header */
  taskHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap'
  },
  taskHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  taskId: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.03em',
    color: 'var(--color-primary)',
    margin: 0
  },
  statusBadge: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    fontWeight: 600,
    color: color,
    padding: '4px 12px',
    borderRadius: 'var(--radius-sm)',
    background: `${color}15`,
    border: `1px solid ${color}33`
  }),
  cancelMainBtn: (loading) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-error)',
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-error)',
    background: 'var(--color-error-dim)',
    opacity: loading ? 0.5 : 1,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s'
  }),

  /* Description */
  description: {
    fontSize: 14,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: 0
  },

  /* Meta row */
  metaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12
  },
  metaCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
  },
  metaIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'var(--color-primary-dim)',
    color: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  metaLabel: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600
  },
  metaValue: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '-0.02em'
  },

  /* Sections */
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  sectionTitleText: {
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

  /* Step results */
  stepGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 10
  },
  stepCard: {
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderLeft: '3px solid',
    borderRadius: 'var(--radius)'
  },
  stepCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  stepName: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  stepStatus: {
    fontSize: 11,
    fontWeight: 600
  },
  stepMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  stepCapability: {
    fontSize: 10,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-primary)',
    background: 'var(--color-primary-dim)',
    padding: '1px 6px',
    borderRadius: 3
  },
  stepAgent: {
    fontSize: 10,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)'
  },
  stepDuration: {
    fontSize: 10,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-secondary)'
  },
  stepReasoning: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    marginTop: 8,
    lineHeight: 1.5,
    fontStyle: 'italic'
  },

  /* Plan info */
  planCard: {
    padding: 16,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  planMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    flexWrap: 'wrap'
  },
  planMetaItem: {
    fontSize: 12,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-secondary)'
  },
  planSummary: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: 0,
    fontStyle: 'italic'
  },
  planSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  planStepsTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  planStepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10
  },
  planStepId: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-primary)',
    minWidth: 28
  },
  planStepText: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
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
  }
}
