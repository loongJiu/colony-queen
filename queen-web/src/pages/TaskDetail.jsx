import { useEffect, useState, useMemo, useRef } from 'react'
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
  const storeTaskData = useTaskStore((s) => s.tasks.find((t) => t.taskId === taskId))
  const liveLogs = useTaskStore((s) => s.taskLogs[taskId])

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  // API 返回的初始日志（刷新后可恢复）
  const apiLogsRef = useRef([])

  // Fetch full task details via API (once per taskId)
  useEffect(() => {
    let cancelled = false
    setTask(null)
    setError(null)
    setLoading(true)

    apiFetch(`/task/${taskId}`)
      .then((data) => {
        if (!cancelled) {
          if (data.logs?.length > 0) {
            apiLogsRef.current = data.logs
            const existing = useTaskStore.getState().taskLogs[taskId]
            if (!existing || existing.length === 0) {
              for (const log of data.logs) {
                useTaskStore.getState().addLog(log)
              }
            }
          }
          setTask(data)
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

  // 合并：API 历史 + SSE 实时日志（去重）
  const logs = useMemo(() => {
    const apiLogs = apiLogsRef.current
    if (!liveLogs || liveLogs.length === 0) return apiLogs
    if (apiLogs.length === 0) return liveLogs
    return liveLogs
  }, [liveLogs])

  // Merge: API data as base, store data overlays for real-time updates
  const effectiveTask = useMemo(() => {
    if (task) return { ...task, ...(storeTaskData || {}) }
    return storeTaskData
  }, [task, storeTaskData])

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

  if (error || !effectiveTask) {
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

  const status = effectiveTask.status || 'pending'
  const statusColor = TASK_STATUS_COLORS[status] || '#6b7280'
  const isActive = status === 'running' || status === 'pending' || status === 'planning'
  const steps = effectiveTask.steps || []
  const results = effectiveTask.results || []
  const duration = effectiveTask.startedAt ? (effectiveTask.finishedAt || Date.now()) - effectiveTask.startedAt : null
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
      {effectiveTask.request?.description && (
        <p style={styles.description}>{effectiveTask.request.description}</p>
      )}

      {/* Meta cards */}
      <div style={styles.metaRow}>
        <MetaCard icon={<Clock size={14} />} label='Duration' value={duration != null ? formatDuration(duration) : '-'} />
        <MetaCard icon={<Layers size={14} />} label='Progress' value={`${completedSteps} / ${totalSteps} steps`} />
        <MetaCard icon={<Network size={14} />} label='Strategy' value={effectiveTask.strategy || 'single'} />
        {effectiveTask.planInfo?.model && (
          <MetaCard icon={<Brain size={14} />} label='Planner' value={`${effectiveTask.planInfo.model}${effectiveTask.planInfo.degraded ? ' (fallback)' : ''}`} />
        )}
      </div>

      {/* LLM/Keyword Planning Details (moved above Execution Flow) */}
      {effectiveTask.planInfo && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <Brain size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>
              {effectiveTask.planInfo.method === 'llm' ? 'LLM Planning Details' : 'Keyword Planning Details'}
            </span>
            <div style={styles.sectionLine} />
          </div>
          <div style={styles.planCard}>
            <div style={styles.planMetaRow}>
              <span style={styles.planMetaItem}>
                Method: <strong style={{
                  color: effectiveTask.planInfo.method === 'llm' ? 'var(--color-info)' : 'var(--color-primary)',
                  background: effectiveTask.planInfo.method === 'llm' ? 'var(--color-info)15' : 'var(--color-primary-dim)',
                  padding: '1px 6px',
                  borderRadius: 3
                }}>
                  {effectiveTask.planInfo.method === 'llm' ? 'LLM' : 'Keyword'}
                </strong>
              </span>
              {effectiveTask.planInfo.model && (
                <span style={styles.planMetaItem}>Model: <strong>{effectiveTask.planInfo.model}</strong></span>
              )}
              {effectiveTask.planInfo.durationMs != null && (
                <span style={styles.planMetaItem}>Duration: <strong>{formatDuration(effectiveTask.planInfo.durationMs)}</strong></span>
              )}
              <span style={styles.planMetaItem}>
                Fallback: <strong style={{ color: effectiveTask.planInfo.degraded ? 'var(--color-error)' : 'var(--color-success)' }}>
                  {effectiveTask.planInfo.degraded ? 'Yes' : 'No'}
                </strong>
              </span>
            </div>

            {/* Keyword matching details */}
            {effectiveTask.planInfo.method === 'keyword' && effectiveTask.planInfo.matchedKeywords?.length > 0 && (
              <div style={styles.planSteps}>
                <div style={styles.planStepsTitle}>Matched Keywords:</div>
                {effectiveTask.planInfo.matchedKeywords.map((m, i) => (
                  <div key={i} style={styles.planStepRow}>
                    <span style={styles.planStepId}>"{m.keyword}"</span>
                    <span style={{ ...styles.planStepText, color: 'var(--color-primary)' }}>→</span>
                    <span style={styles.planStepText}>{m.capability}</span>
                  </div>
                ))}
              </div>
            )}
            {effectiveTask.planInfo.method === 'keyword' && (!effectiveTask.planInfo.matchedKeywords || effectiveTask.planInfo.matchedKeywords.length === 0) && (
              <p style={styles.planSummary}>No keywords matched — used fallback capability.</p>
            )}

            {/* LLM step reasoning */}
            {effectiveTask.planInfo.steps?.length > 0 && (
              <div style={styles.planSteps}>
                <div style={styles.planStepsTitle}>Step Reasoning:</div>
                {effectiveTask.planInfo.steps.map((s, i) => (
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

      {/* Planning state indicator */}
      {status === 'planning' && (
        <section style={styles.section}>
          <div style={styles.planningCard}>
            <div style={styles.planningHeader}>
              <Brain size={20} style={{ color: 'var(--color-info)', animation: 'spin 2s linear infinite' }} />
              <span style={styles.planningText}>Planning your task...</span>
            </div>
            <TaskLogPanel logs={logs} maxHeight={200} />
          </div>
          <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
        </section>
      )}

      {/* Execution flow (with merged Step Results via node detail panel) */}
      {steps.length > 0 && status !== 'planning' && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>Execution Flow</span>
            <div style={styles.sectionLine} />
          </div>
          <TaskFlow
            steps={steps}
            results={results}
            strategy={effectiveTask.strategy}
            taskStatus={status}
            planSteps={effectiveTask.planInfo?.steps}
            onCancel={isActive ? handleCancel : undefined}
          />
        </section>
      )}

      {/* Real-time logs */}
      {status !== 'planning' && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>Real-time Logs</span>
            <div style={styles.sectionLine} />
          </div>
          <TaskLogPanel logs={logs} maxHeight={300} />
        </section>
      )}

      {/* Final output */}
      {effectiveTask.finalOutput && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span style={styles.sectionTitleText}>Final Output</span>
            <div style={styles.sectionLine} />
          </div>
          <div style={styles.outputBlock}>
            {renderOutput(effectiveTask.finalOutput)}
          </div>
        </section>
      )}
    </div>
  )
}

function renderOutput (output) {
  if (output == null) return null
  if (typeof output === 'string') return <pre style={styles.outputPre}>{output}</pre>
  if (typeof output === 'object' && output.result != null) {
    return <pre style={styles.outputPre}>{typeof output.result === 'string' ? output.result : JSON.stringify(output.result, null, 2)}</pre>
  }
  return <pre style={styles.outputPre}>{JSON.stringify(output, null, 2)}</pre>
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

  /* Planning state */
  planningCard: {
    padding: 20,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  planningHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  planningText: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-secondary)'
  },

  /* Output */
  outputBlock: {
    marginTop: 10,
    padding: 12,
    background: 'var(--color-surface-hover)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)'
  },
  outputPre: {
    margin: 0,
    fontSize: 13,
    fontFamily: "'IBM Plex Mono', monospace",
    lineHeight: 1.6,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
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
