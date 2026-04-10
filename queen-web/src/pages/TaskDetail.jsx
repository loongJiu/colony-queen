/**
 * TaskDetail — 生物发光指挥中心 · 任务监控台
 *
 * 设计隐喻：深海指挥舱，任务状态如生物发光般在暗色界面上脉动。
 * 运行中的任务呼吸琥珀光，成功的任务散发翡翠色宁静辉光，失败则闪烁红色警报。
 */
import { useEffect, useState, useMemo, useRef, useCallback, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTaskStore } from '../stores/tasks'
import { apiFetch } from '../api/client'
import { TaskLogPanel } from '../components/task/TaskLogPanel'
import { formatDuration } from '../utils/format'
import { TASK_STATUS_COLORS, STATUS_LABELS } from '../utils/constants'
import {
  ArrowLeft, XCircle, Clock, CheckCircle2, AlertTriangle,
  Layers, Brain, Network, Star, Send, Sparkles,
  ChevronRight, Zap, Activity, Radio, ChevronDown, ChevronUp,
  RotateCcw, Loader2, GitFork, Link2, CircleDot, Copy, Check, FileText
} from 'lucide-react'

/* ── 状态辉光配置 ── */
const STATUS_GLOW = {
  planning: { color: '#818cf8', label: 'Planning', breath: true },
  pending:  { color: '#6366f1', label: 'Queued',   breath: true },
  running:  { color: '#f5a623', label: 'Running',  breath: true },
  success:  { color: '#34d399', label: 'Success',  breath: false },
  failure:  { color: '#f87171', label: 'Failed',   breath: false },
  partial:  { color: '#f97316', label: 'Partial',  breath: false },
  cancelled:{ color: '#6b7280', label: 'Cancelled', breath: false },
}

/* ── 主组件 ── */
export function TaskDetail () {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const storeTaskData = useTaskStore((s) => s.tasks.find((t) => t.taskId === taskId))
  const liveLogs = useTaskStore((s) => s.taskLogs[taskId])

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const scrollRef = useRef(null)

  // Feedback state
  const [feedbackList, setFeedbackList] = useState([])
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)

  const apiLogsRef = useRef([])

  // ── Fetch task ──
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

  // ── Scroll spy for sticky header (listen on parent scroll container) ──
  useEffect(() => {
    if (loading) return
    // The scroll container is Layout's <main> (parent of this page)
    const el = scrollRef.current?.parentElement
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 120)
    el.addEventListener('scroll', onScroll, { passive: true })
    // Initial check
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [loading])

  // ── Merge logs ──
  const logs = useMemo(() => {
    const apiLogs = apiLogsRef.current
    if (!liveLogs || liveLogs.length === 0) return apiLogs
    if (apiLogs.length === 0) return liveLogs
    return liveLogs
  }, [liveLogs])

  const effectiveTask = useMemo(() => {
    if (task) return { ...task, ...(storeTaskData || {}) }
    return storeTaskData
  }, [task, storeTaskData])

  // ── Fetch feedback ──
  useEffect(() => {
    if (!taskId) return
    apiFetch(`/task/${taskId}/feedback`)
      .then((data) => { if (data?.feedbacks?.length) setFeedbackList(data.feedbacks) })
      .catch(() => {})
  }, [taskId])

  const handleSubmitFeedback = async () => {
    if (rating === 0) return
    setSubmitting(true)
    try {
      const fb = await apiFetch(`/task/${taskId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ userScore: rating, comment }),
      })
      setFeedbackList((prev) => [...prev, fb])
      setRating(0)
      setComment('')
      setJustSubmitted(true)
      setTimeout(() => setJustSubmitted(false), 2000)
    } catch (err) {
      alert(`Submit failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

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

  // ── Derived values ──
  const status = effectiveTask?.status || 'pending'
  const glow = STATUS_GLOW[status] || STATUS_GLOW.pending
  const statusColor = TASK_STATUS_COLORS[status] || '#6b7280'
  const isActive = status === 'running' || status === 'pending' || status === 'planning'
  const steps = effectiveTask?.steps || []
  const results = effectiveTask?.results || []
  const duration = effectiveTask?.startedAt
    ? (effectiveTask.finishedAt || Date.now()) - effectiveTask.startedAt
    : null
  const completedSteps = results.filter((r) => r.status === 'success').length
  const totalSteps = steps.length || 1
  const isFinished = ['success', 'failure', 'partial', 'cancelled'].includes(status)

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div ref={scrollRef} style={s.page}>
        <div style={s.skeletonHero}>
          <div style={s.skeletonLine(180, 28)} />
          <div style={{ ...s.skeletonLine(320, 14), marginTop: 12 }} />
          <div style={{ ...s.skeletonLine('100%', 1), marginTop: 20 }} />
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {[120, 100, 90, 110].map((w, i) => (
              <div key={i} style={s.skeletonLine(w, 48)} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !effectiveTask) {
    return (
      <div style={s.page}>
        <div style={s.errorState}>
          <AlertTriangle size={32} style={{ color: 'var(--color-error)', opacity: 0.6 }} />
          <div style={s.errorTitle}>{error || 'Task not found'}</div>
          <button onClick={() => navigate('/tasks')} style={s.errorBack}>
            <ArrowLeft size={13} /> Back to Tasks
          </button>
        </div>
      </div>
    )
  }

  // ── Time markers ──
  const phases = []
  if (effectiveTask.createdAt) {
    phases.push({ label: 'Created', time: effectiveTask.createdAt, color: '#6366f1' })
  }
  if (effectiveTask.startedAt) {
    phases.push({ label: 'Started', time: effectiveTask.startedAt, color: '#f5a623' })
  }
  if (effectiveTask.finishedAt) {
    phases.push({ label: 'Finished', time: effectiveTask.finishedAt, color: statusColor })
  }

  return (
    <div ref={scrollRef} style={s.page}>
      {/* ── Ambient status glow ── */}
      <div style={{
        ...s.ambientGlow,
        background: glow.breath
          ? `radial-gradient(ellipse 80% 50% at 50% 0%, ${glow.color}12 0%, transparent 70%)`
          : `radial-gradient(ellipse 80% 50% at 50% 0%, ${glow.color}08 0%, transparent 70%)`,
        animation: glow.breath ? `ambientBreath 4s ease-in-out infinite` : 'none',
        '--glow-color': glow.color,
      }} />

      {/* ── CSS Keyframes ── */}
      <style>{`
        @keyframes ambientBreath {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes heroReveal {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spineGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes nodeReveal {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes starCascade {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes successRipple {
          0% { box-shadow: 0 0 0 0 ${statusColor}44; }
          100% { box-shadow: 0 0 0 24px transparent; }
        }
        @keyframes terminalBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes outputReveal {
          from { opacity: 0; clip-path: inset(0 100% 0 0); }
          to { opacity: 1; clip-path: inset(0 0 0 0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Sticky observation bar ── */}
      {scrolled && (
        <div style={s.stickyBar}>
          <div style={s.stickyLeft}>
            <div style={{
              ...s.stickyDot,
              backgroundColor: statusColor,
              boxShadow: `0 0 8px ${statusColor}66`,
              animation: glow.breath ? 'pulse 2s ease-in-out infinite' : 'none',
            }} />
            <span style={s.stickyId}>{taskId}</span>
            <span style={{ ...s.stickyStatus, color: statusColor }}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <div style={s.stickyRight}>
            {duration != null && (
              <span style={s.stickyMeta}>
                <Clock size={11} /> {formatDuration(duration)}
              </span>
            )}
            <span style={s.stickyMeta}>
              <Layers size={11} /> {completedSteps}/{totalSteps}
            </span>
          </div>
        </div>
      )}

      {/* ── Back navigation ── */}
      <button onClick={() => navigate('/tasks')} style={s.backBtn}>
        <ArrowLeft size={13} /> Tasks
      </button>

      {/* ═══════════════════════════════════════════
          HERO: 任务身份 + 状态辉光
      ═══════════════════════════════════════════ */}
      <section style={{
        ...s.hero,
        borderColor: `${statusColor}30`,
        animation: 'heroReveal 0.5s var(--ease-spring) backwards',
      }}>
        {/* Status aura ring */}
        <div style={{
          ...s.heroAura,
          border: `1px solid ${statusColor}18`,
          boxShadow: isActive
            ? `inset 0 0 40px ${statusColor}08, 0 0 60px ${statusColor}06`
            : `inset 0 0 30px ${statusColor}05`,
          animation: glow.breath ? `ambientBreath 3s ease-in-out infinite` : 'none',
        }} />

        {/* Status beacon */}
        <div style={s.heroBeacon}>
          <div style={{
            ...s.beaconDot,
            backgroundColor: statusColor,
            boxShadow: `0 0 12px ${statusColor}88, 0 0 24px ${statusColor}44`,
            animation: glow.breath ? `ambientBreath 2s ease-in-out infinite` : 'none',
          }} />
          <div style={{
            ...s.beaconRing,
            borderColor: `${statusColor}33`,
            animation: glow.breath ? `successRipple 2.5s ease-out infinite` : 'none',
          }} />
        </div>

        {/* Task identity */}
        <div style={s.heroContent}>
          <div style={s.heroLabel}>
            <Radio size={10} style={{ opacity: 0.5 }} />
            <span>MISSION</span>
          </div>
          <h1 style={s.heroTitle}>
            {taskId}
            {isActive && <span style={s.cursor} />}
          </h1>

          {/* Description */}
          {effectiveTask.request?.description && (
            <p style={s.heroDesc}>{effectiveTask.request.description}</p>
          )}

          {/* Status + Metrics row */}
          <div style={s.heroMetrics}>
            <div style={{ ...s.statusChip, color: statusColor, borderColor: `${statusColor}33`, background: `${statusColor}0d` }}>
              {isActive && <Activity size={10} style={{ animation: 'spin 2s linear infinite' }} />}
              <span>{STATUS_LABELS[status]}</span>
            </div>

            {duration != null && (
              <div style={s.metricChip}>
                <Clock size={11} />
                <span style={s.metricValue}>{formatDuration(duration)}</span>
              </div>
            )}
            <div style={s.metricChip}>
              <Layers size={11} />
              <span style={s.metricValue}>{completedSteps}/{totalSteps} steps</span>
            </div>
            <div style={s.metricChip}>
              <Network size={11} />
              <span style={s.metricValue}>{effectiveTask.strategy || 'single'}</span>
            </div>
            {effectiveTask.planInfo?.model && (
              <div style={s.metricChip}>
                <Brain size={11} />
                <span style={s.metricValue}>{effectiveTask.planInfo.model}</span>
              </div>
            )}
          </div>

          {/* Phase timeline */}
          {phases.length > 0 && (
            <div style={s.phaseTimeline}>
              {phases.map((phase, i) => (
                <div key={i} style={s.phaseItem}>
                  <div style={{ ...s.phaseDot, backgroundColor: phase.color, boxShadow: `0 0 6px ${phase.color}44` }} />
                  <span style={s.phaseLabel}>{phase.label}</span>
                  <span style={s.phaseTime}>{new Date(phase.time).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cancel action */}
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                ...s.cancelBtn,
                opacity: cancelling ? 0.5 : 1,
                cursor: cancelling ? 'not-allowed' : 'pointer',
              }}
            >
              <XCircle size={13} />
              {cancelling ? 'Cancelling...' : 'Abort Mission'}
            </button>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          RESULT PANEL — 任务完成后紧跟 Hero 展示
      ═══════════════════════════════════════════ */}
      {isFinished && effectiveTask.finalOutput && (
        <ResultPanel output={effectiveTask.finalOutput} status={status} />
      )}

      {/* ═══════════════════════════════════════════
          TIMELINE SPINE: 规划 → 执行 → 日志 → 反馈
      ═══════════════════════════════════════════ */}
      <div style={s.timelineContainer}>
        {/* Vertical spine */}
        <div style={s.spine} />

        {/* ── PLANNING ── */}
        {effectiveTask.planInfo && (
          <TimelineNode
            index={0}
            icon={<Brain size={14} />}
            label={effectiveTask.planInfo.method === 'llm' ? 'LLM Planning' : 'Keyword Planning'}
            color={effectiveTask.planInfo.method === 'llm' ? '#818cf8' : '#f5a623'}
          >
            <div style={s.planGrid}>
              <div style={s.planChip}>
                <span style={s.planChipLabel}>Method</span>
                <span style={{
                  ...s.planChipValue,
                  color: effectiveTask.planInfo.method === 'llm' ? '#818cf8' : '#f5a623',
                }}>
                  {effectiveTask.planInfo.method === 'llm' ? 'LLM' : 'Keyword'}
                </span>
              </div>
              {effectiveTask.planInfo.model && (
                <div style={s.planChip}>
                  <span style={s.planChipLabel}>Model</span>
                  <span style={s.planChipValue}>{effectiveTask.planInfo.model}</span>
                </div>
              )}
              {effectiveTask.planInfo.durationMs != null && (
                <div style={s.planChip}>
                  <span style={s.planChipLabel}>Duration</span>
                  <span style={s.planChipValue}>{formatDuration(effectiveTask.planInfo.durationMs)}</span>
                </div>
              )}
              <div style={s.planChip}>
                <span style={s.planChipLabel}>Fallback</span>
                <span style={{
                  ...s.planChipValue,
                  color: effectiveTask.planInfo.degraded ? '#f87171' : '#34d399',
                }}>
                  {effectiveTask.planInfo.degraded ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {/* Matched keywords */}
            {effectiveTask.planInfo.method === 'keyword' && effectiveTask.planInfo.matchedKeywords?.length > 0 && (
              <div style={s.keywordList}>
                {effectiveTask.planInfo.matchedKeywords.map((m, i) => (
                  <div key={i} style={s.keywordRow}>
                    <Zap size={9} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <span style={s.keywordText}>"{m.keyword}"</span>
                    <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span style={s.keywordCap}>{m.capability}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Step reasoning */}
            {effectiveTask.planInfo.steps?.length > 0 && (
              <div style={s.reasoningList}>
                <span style={s.sectionLabel}>Step Reasoning</span>
                {effectiveTask.planInfo.steps.map((step, i) => (
                  <div key={i} style={s.reasoningRow}>
                    <span style={s.stepIndex}>{step.stepId || `s${i + 1}`}</span>
                    <span style={s.stepReasoning}>{step.reasoning || step.name || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </TimelineNode>
        )}

        {/* ── PLANNING STATE (active) ── */}
        {status === 'planning' && (
          <TimelineNode
            index={effectiveTask.planInfo ? 1 : 0}
            icon={<Brain size={14} style={{ animation: 'spin 2s linear infinite' }} />}
            label="Planning in Progress"
            color="#818cf8"
            active
          >
            <TaskLogPanel logs={logs} maxHeight={200} />
          </TimelineNode>
        )}

        {/* ── EXECUTION FLOW ── */}
        {steps.length > 0 && status !== 'planning' && (
          <TimelineNode
            index={effectiveTask.planInfo ? 1 : 0}
            icon={<Activity size={14} />}
            label="Execution Flow"
            color={statusColor}
            active={isActive}
          >
            <ExecutionFlow
              steps={steps}
              results={results}
              strategy={effectiveTask.strategy || 'single'}
              taskStatus={status}
              planSteps={effectiveTask.planInfo?.steps}
              onCancel={isActive ? handleCancel : undefined}
            />
          </TimelineNode>
        )}

        {/* ── REAL-TIME LOGS ── */}
        {status !== 'planning' && (
          <TimelineNode
            index={(effectiveTask.planInfo ? 1 : 0) + (steps.length > 0 && status !== 'planning' ? 1 : 0)}
            icon={<Radio size={14} />}
            label="Signal Log"
            color="#60a5fa"
          >
            <TaskLogPanel logs={logs} maxHeight={300} />
          </TimelineNode>
        )}

        {/* ── FEEDBACK ── */}
        {isFinished && (
          <TimelineNode
            index={3}
            icon={<Star size={14} />}
            label="Mission Feedback"
            color="#f5a623"
          >
            {/* Auto score */}
            {effectiveTask.autoScore != null && (
              <div style={s.autoScore}>
                <Sparkles size={13} style={{ color: 'var(--color-primary)' }} />
                <span style={s.autoScoreLabel}>Auto Score</span>
                <span style={s.autoScoreValue}>{effectiveTask.autoScore}</span>
              </div>
            )}

            {/* Existing feedback */}
            {feedbackList.map((fb, i) => (
              <div key={i} style={s.fbCard}>
                <div style={s.fbStars}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const score = fb.userScore || fb.score
                    return (
                      <Star
                        key={star}
                        size={13}
                        fill={star <= score ? '#f5a623' : 'none'}
                        stroke={star <= score ? '#f5a623' : 'var(--color-border)'}
                        style={{ opacity: star <= score ? 1 : 0.3 }}
                      />
                    )
                  })}
                  <span style={s.fbRating}>{fb.userScore || fb.score}/5</span>
                </div>
                {(fb.userComment || fb.comment) && (
                  <p style={s.fbComment}>{fb.userComment || fb.comment}</p>
                )}
                <span style={s.fbMeta}>
                  {fb.source === 'auto' ? 'Auto' : 'Manual'} · {fb.createdAt ? new Date(fb.createdAt).toLocaleString() : ''}
                </span>
              </div>
            ))}

            {/* Rating form */}
            <div style={{
              ...s.ratingForm,
              animation: justSubmitted ? 'successRipple 0.6s ease-out' : undefined,
            }}>
              <div style={s.starRow}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= (hoverRating || rating)
                  const delay = hoverRating > 0 ? `${(star - 1) * 50}ms` : '0ms'
                  return (
                    <button
                      key={star}
                      style={s.starBtn}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                    >
                      <Star
                        size={24}
                        fill={active ? '#f5a623' : 'none'}
                        stroke={active ? '#f5a623' : 'var(--color-border)'}
                        style={{
                          transition: 'all 0.2s var(--ease-spring)',
                          transform: active ? 'scale(1.1)' : 'scale(1)',
                          filter: active ? `drop-shadow(0 0 6px #f5a62366)` : 'none',
                          animation: hoverRating >= star ? `starCascade 0.3s ${delay} var(--ease-bounce) backwards` : undefined,
                        }}
                      />
                    </button>
                  )
                })}
                {rating > 0 && <span style={s.ratingDisplay}>{rating}/5</span>}
              </div>
              <div style={s.commentRow}>
                <input
                  style={s.commentInput}
                  placeholder='Leave a comment (optional)...'
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  onClick={handleSubmitFeedback}
                  disabled={submitting || rating === 0}
                  style={{
                    ...s.submitBtn,
                    opacity: submitting || rating === 0 ? 0.4 : 1,
                    cursor: submitting || rating === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? (
                    <Activity size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Send size={13} />
                  )}
                  Submit
                </button>
              </div>
            </div>
          </TimelineNode>
        )}
      </div>
    </div>
  )
}

/* ── Timeline Node ── */
function TimelineNode ({ index, icon, label, color, active, children }) {
  return (
    <div style={{
      ...s.node,
      animation: `nodeReveal 0.4s ${index * 80 + 200}ms var(--ease-out) backwards`,
    }}>
      {/* Spine connector dot */}
      <div style={s.nodeDot}>
        <div style={{
          ...s.nodeDotInner,
          backgroundColor: color,
          boxShadow: active ? `0 0 10px ${color}66` : `0 0 4px ${color}33`,
          animation: active ? `ambientBreath 2s ease-in-out infinite` : 'none',
        }} />
      </div>

      {/* Node content */}
      <div style={s.nodeContent}>
        <div style={s.nodeHeader}>
          <span style={{ ...s.nodeIcon, color }}>{icon}</span>
          <span style={s.nodeLabel}>{label}</span>
          {active && (
            <span style={{ ...s.nodeActive, color, borderColor: `${color}33` }}>
              LIVE
            </span>
          )}
        </div>
        <div style={s.nodeBody}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
    EXECUTION FLOW — 自定义流程可视化
══════════════════════════════════════════════ */

const STEP_COLORS = {
  pending: '#6366f1',
  running: '#f5a623',
  success: '#34d399',
  failure: '#f87171',
  cancelled: '#6b7280',
}

const STRATEGY_META = {
  single:   { label: 'Single',   icon: CircleDot, color: '#818cf8' },
  serial:   { label: 'Serial',   icon: Link2,     color: '#f5a623' },
  parallel: { label: 'Parallel', icon: GitFork,    color: '#34d399' },
}

function ExecutionFlow ({ steps, results, strategy, taskStatus, planSteps, onCancel }) {
  const [expandedStep, setExpandedStep] = useState(null)

  const merged = useMemo(() => {
    const rMap = {}
    for (const r of results) rMap[r.stepIndex] = r
    return steps.map((step) => {
      const r = rMap[step.stepIndex]
      return {
        ...step,
        status: r?.status || step.status || 'pending',
        durationMs: r ? (r.finishedAt || Date.now()) - r.startedAt : step.durationMs,
        agentId: r?.agentId || step.agentId,
        retryCount: r?.retryCount || 0,
        retryHistory: r?.retryHistory || [],
        output: r?.output,
        error: r?.error,
        usage: r?.usage,
      }
    })
  }, [steps, results])

  const doneCount = results.filter(r => r.status === 'success').length
  const totalCount = steps.length
  const pct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0
  const meta = STRATEGY_META[strategy] || STRATEGY_META.single
  const StrategyIcon = meta.icon
  const isActive = ['running', 'pending', 'planning'].includes(taskStatus)

  return (
    <>
      {/* Flow keyframes */}
      <style>{`
        @keyframes signalFlow {
          from { background-position: 0 0; }
          to { background-position: 20px 0; }
        }
        @keyframes signalDotMove {
          0% { left: 2px; opacity: 0; transform: scale(0.5); }
          15% { opacity: 1; transform: scale(1.2); }
          25% { transform: scale(1); }
          85% { opacity: 1; transform: scale(1); }
          100% { left: calc(100% - 7px); opacity: 0; transform: scale(0.5); }
        }
        @keyframes stepCardReveal {
          from { opacity: 0; transform: translateY(14px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes forkLineGrow {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
        @keyframes progressGlow {
          0%, 100% { opacity: 0.8; filter: brightness(1); }
          50% { opacity: 1; filter: brightness(1.5); }
        }
        @keyframes branchReveal {
          from { opacity: 0; transform: translateY(20px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes forkNodePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 8px currentColor; }
          50% { transform: scale(1.3); box-shadow: 0 0 20px currentColor; }
        }
        @keyframes statusGlow {
          0%, 100% { filter: drop-shadow(0 0 3px currentColor); }
          50% { filter: drop-shadow(0 0 10px currentColor); }
        }

        /* ── Running: HUD Targeting System ── */
        @keyframes bracketPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes scanBeam {
          0% { top: -10%; opacity: 0; }
          5% { opacity: 0.7; }
          95% { opacity: 0.7; }
          100% { top: 110%; opacity: 0; }
        }
        @keyframes gridDrift {
          from { background-position: 0 0; }
          to { background-position: 20px -20px; }
        }
        @keyframes beaconExpand {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(4); opacity: 0; }
        }
        @keyframes borderTrace {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @keyframes beaconPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 6px currentColor; }
          50% { transform: scale(1.3); box-shadow: 0 0 16px currentColor; }
        }
        @keyframes beaconRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(3); opacity: 0; }
        }

        /* ── Success: Field Stabilization ── */
        @keyframes fieldStabilize {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @keyframes completionSweep {
          0% { left: -30%; opacity: 0; }
          20% { opacity: 0.4; }
          80% { opacity: 0.4; }
          100% { left: 130%; opacity: 0; }
        }

        /* ── Failure: Alert Protocol ── */
        @keyframes stripeMarch {
          from { background-position: 0 0; }
          to { background-position: 14px 0; }
        }
        @keyframes redFlash {
          0%, 85%, 100% { opacity: 0; }
          90% { opacity: 0.15; }
        }
        @keyframes alertBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
        @keyframes alertPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        /* ── Pending: Scanning Mode ── */
        @keyframes orbitSpin {
          from { transform: rotate(0deg) translateX(10px); }
          to { transform: rotate(360deg) translateX(10px); }
        }
        @keyframes radarPing {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(6); opacity: 0; }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes waveformScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-48px); }
        }
        @keyframes crosshairPulse {
          0%, 100% { opacity: 0.25; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes ledGlow {
          0%, 100% { opacity: 0.3; box-shadow: 0 0 3px currentColor; }
          50% { opacity: 1; box-shadow: 0 0 10px currentColor; }
        }
        @keyframes diagScan {
          0% { top: -15%; left: 80%; opacity: 0; }
          10% { opacity: 0.35; }
          90% { opacity: 0.35; }
          100% { top: 115%; left: -20%; opacity: 0; }
        }
        @keyframes barPulse {
          0%, 100% { transform: scaleY(0.6); }
          50% { transform: scaleY(1); }
        }
        @keyframes initDotFade {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.5; }
        }
        @keyframes progressArc {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header: strategy + progress ── */}
      <div style={ef.header}>
        <div style={ef.headerLeft}>
          <div style={{
            ...ef.strategyBadge,
            color: meta.color,
            background: `${meta.color}10`,
            border: `1px solid ${meta.color}28`,
          }}>
            <StrategyIcon size={11} />
            <span>{meta.label}</span>
          </div>
          <span style={ef.progressLabel}>
            {doneCount}/{totalCount} completed
          </span>
        </div>
        <div style={ef.progressTrack}>
          <div style={{
            ...ef.progressFill,
            width: `${pct}%`,
            backgroundColor: meta.color,
            boxShadow: isActive ? `0 0 12px ${meta.color}55` : `0 0 6px ${meta.color}22`,
            transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
            animation: isActive ? 'progressGlow 2s ease-in-out infinite' : 'none',
          }} />
        </div>
      </div>

      {/* ── Flow body: switch by strategy ── */}
      {strategy === 'parallel' ? (
        <ParallelLayout
          steps={merged}
          expandedStep={expandedStep}
          onExpand={setExpandedStep}
          isActive={isActive}
          planSteps={planSteps}
          meta={meta}
        />
      ) : strategy === 'serial' ? (
        <SerialLayout
          steps={merged}
          expandedStep={expandedStep}
          onExpand={setExpandedStep}
          isActive={isActive}
          planSteps={planSteps}
          meta={meta}
        />
      ) : (
        <SingleLayout
          step={merged[0]}
          expanded={expandedStep === 0}
          onExpand={() => setExpandedStep(expandedStep === 0 ? null : 0)}
          planStep={planSteps?.[0]}
        />
      )}
    </>
  )
}

/* ── Serial layout: horizontal pipeline ── */
function SerialLayout ({ steps, expandedStep, onExpand, isActive, planSteps, meta }) {
  return (
    <div style={ef.serialWrap}>
      <div style={ef.serialTrack}>
        {steps.map((step, i) => {
          const color = STEP_COLORS[step.status] || STEP_COLORS.pending
          return (
            <Fragment key={step.stepIndex}>
              {i > 0 && (
                <SerialConnector
                  upstreamDone={steps[i - 1]?.status === 'success'}
                  upstreamFailed={steps[i - 1]?.status === 'failure'}
                  downstreamRunning={step.status === 'running'}
                  color={color}
                />
              )}
              <div style={{
                ...ef.serialStepWrap,
                animation: `stepCardReveal 0.35s ${i * 60}ms var(--ease-out) backwards`,
              }}>
                <StepCard
                  step={step}
                  index={i}
                  expanded={expandedStep === step.stepIndex}
                  onExpand={() => onExpand(expandedStep === step.stepIndex ? null : step.stepIndex)}
                  planStep={planSteps?.[i]}
                  compact
                />
              </div>
            </Fragment>
          )
        })}
      </div>
      {/* Serial hint */}
      <div style={ef.strategyHint}>
        <Link2 size={10} style={{ color: meta.color }} />
        <span>Steps execute sequentially — each waits for the previous to complete</span>
      </div>
    </div>
  )
}

/* ── Serial connector ── */
function SerialConnector ({ upstreamDone, upstreamFailed, downstreamRunning, color }) {
  const lineColor = upstreamFailed ? STEP_COLORS.failure
    : upstreamDone ? STEP_COLORS.success
    : 'var(--color-border)'

  return (
    <div style={ef.connector}>
      <div style={{
        ...ef.connectorLine,
        backgroundColor: lineColor,
        boxShadow: downstreamRunning ? `0 0 8px ${color}44` : 'none',
      }} />
      {downstreamRunning && (
        <div style={{
          ...ef.connectorSignal,
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: 'signalDotMove 1.2s linear infinite',
        }} />
      )}
      {/* Arrow tip */}
      <div style={{
        ...ef.connectorArrow,
        borderTopColor: lineColor,
      }} />
    </div>
  )
}

/* ── Parallel layout: fork-join ── */
function ParallelLayout ({ steps, expandedStep, onExpand, isActive, planSteps, meta }) {
  const allDone = steps.every(s => s.status === 'success' || s.status === 'failure' || s.status === 'cancelled')
  const anyRunning = steps.some(s => s.status === 'running')

  return (
    <div style={ef.parallelWrap}>
      {/* Fork node */}
      <div style={ef.forkJoinNode}>
        <div style={{
          ...ef.forkDot,
          background: anyRunning ? '#f5a623' : allDone ? '#34d399' : 'var(--color-text-muted)',
          boxShadow: anyRunning ? '0 0 16px #f5a62388' : allDone ? '0 0 10px #34d39955' : 'none',
          animation: anyRunning ? 'ambientBreath 2s ease-in-out infinite, forkNodePulse 3s ease-in-out infinite' : 'none',
        }} />
        <span style={ef.forkLabel}>DISPATCH</span>
      </div>

      {/* Branch lines (fork) */}
      <div style={{
        ...ef.branchFork,
        '--branch-count': steps.length,
      }}>
        {steps.map((step, i) => {
          const color = STEP_COLORS[step.status] || STEP_COLORS.pending
          return (
            <div key={i} style={{
              ...ef.branchLine,
              borderColor: step.status === 'success' ? STEP_COLORS.success
                : step.status === 'running' ? color
                : 'var(--color-border)',
            }} />
          )
        })}
      </div>

      {/* Parallel step cards */}
      <div style={{
        ...ef.parallelGrid,
        gridTemplateColumns: steps.length <= 2 ? `repeat(${steps.length}, 1fr)` : undefined,
      }}>
        {steps.map((step, i) => {
          const sColor = STEP_COLORS[step.status] || STEP_COLORS.pending
          const sRunning = step.status === 'running'
          return (
            <div key={step.stepIndex} style={{
              ...ef.branchCard,
              animation: `branchReveal 0.45s ${i * 100 + 150}ms var(--ease-spring) backwards`,
            }}>
              <div style={{
                ...ef.branchIndex,
                color: sColor,
                borderColor: `${sColor}44`,
                boxShadow: sRunning ? `0 0 8px ${sColor}44` : 'none',
                animation: sRunning ? 'statusGlow 2s ease-in-out infinite' : 'none',
              }}>
                B{i + 1}
              </div>
            <StepCard
              step={step}
              index={i}
              expanded={expandedStep === step.stepIndex}
              onExpand={() => onExpand(expandedStep === step.stepIndex ? null : step.stepIndex)}
              planStep={planSteps?.[i]}
            />
          </div>
          )
        })}
      </div>

      {/* Branch lines (merge) */}
      <div style={ef.branchFork}>
        {steps.map((_, i) => (
          <div key={i} style={{
            ...ef.branchLine,
            borderColor: 'var(--color-border)',
          }} />
        ))}
      </div>

      {/* Merge node */}
      <div style={ef.forkJoinNode}>
        <div style={{
          ...ef.forkDot,
          background: allDone ? '#34d399' : anyRunning ? '#f5a623' : 'var(--color-text-muted)',
          boxShadow: allDone ? '0 0 10px #34d39955' : anyRunning ? '0 0 12px #f5a62366' : 'none',
          animation: anyRunning ? 'ambientBreath 2.5s ease-in-out infinite' : 'none',
        }} />
        <span style={ef.forkLabel}>MERGE</span>
      </div>

      {/* Parallel hint */}
      <div style={ef.strategyHint}>
        <GitFork size={10} style={{ color: meta.color }} />
        <span>{steps.length} branches execute concurrently — results merged on completion</span>
      </div>
    </div>
  )
}

/* ── Single layout: one focused card ── */
function SingleLayout ({ step, expanded, onExpand, planStep }) {
  if (!step) return null
  const color = STEP_COLORS[step.status] || STEP_COLORS.pending

  return (
    <div style={{
      ...ef.singleWrap,
      animation: 'stepCardReveal 0.4s var(--ease-out) backwards',
    }}>
      <StepCard
        step={step}
        index={0}
        expanded={expanded}
        onExpand={onExpand}
        planStep={planStep}
        full
      />
    </div>
  )
}

/* ── Step Card (shared) ── */
function StepCard ({ step, index, expanded, onExpand, planStep, compact, full }) {
  const [showRetry, setShowRetry] = useState(false)
  const [hovered, setHovered] = useState(false)
  const color = STEP_COLORS[step.status] || STEP_COLORS.pending
  const isRunning = step.status === 'running'
  const isSuccess = step.status === 'success'
  const isFailed = step.status === 'failure'
  const isPending = step.status === 'pending'
  const name = step.name || step.description || `Step ${(step.stepIndex ?? index) + 1}`

  return (
    <div
      style={{
        ...ef.stepCard,
        borderColor: `${color}25`,
        background: 'var(--color-surface)',
        boxShadow: isRunning
          ? `0 0 12px ${color}15, 0 2px 8px rgba(0,0,0,0.2)`
          : `0 2px 8px rgba(0,0,0,0.18)`,
        ...(full ? ef.stepCardFull : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── STATUS EFFECTS LAYER ── */}

      {/* ═══════════════════════════════════════
          RUNNING — HUD Targeting System
          13 visual layers of sci-fi immersion
      ═══════════════════════════════════════ */}
      {isRunning && (
        <>
          {/* L1: Base surface */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            background: `linear-gradient(135deg, ${color}0a 0%, var(--color-surface) 40%)`,
            pointerEvents: 'none', zIndex: 0,
          }} />

          {/* L2: Data grid — drifting coordinate mesh */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            backgroundImage: `linear-gradient(${color}08 1px, transparent 1px), linear-gradient(90deg, ${color}08 1px, transparent 1px)`,
            backgroundSize: '24px 24px', animation: 'gridDrift 3s linear infinite',
            pointerEvents: 'none', zIndex: 0, opacity: 0.8,
          }} />

          {/* L3: Edge frame lines — connecting corners */}
          <div style={{ position: 'absolute', top: 6, left: 22, right: 22, height: 1, background: `${color}10`, pointerEvents: 'none', zIndex: 1 }} />
          <div style={{ position: 'absolute', bottom: 6, left: 22, right: 22, height: 1, background: `${color}10`, pointerEvents: 'none', zIndex: 1 }} />
          <div style={{ position: 'absolute', left: 6, top: 22, bottom: 22, width: 1, background: `${color}10`, pointerEvents: 'none', zIndex: 1 }} />
          <div style={{ position: 'absolute', right: 6, top: 22, bottom: 22, width: 1, background: `${color}10`, pointerEvents: 'none', zIndex: 1 }} />

          {/* L4: Corner targeting brackets */}
          {[
            { top: 4, left: 4, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
            { top: 4, right: 4, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
            { bottom: 4, left: 4, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
            { bottom: 4, right: 4, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
          ].map((pos, i) => (
            <div key={`rb-${i}`} style={{
              position: 'absolute', ...pos,
              width: 16, height: 16, borderRadius: 1,
              animation: `bracketPulse 2s ${i * 0.3}s ease-in-out infinite`,
              pointerEvents: 'none', zIndex: 2,
            }} />
          ))}

          {/* L5: Corner LED indicators */}
          {[
            { top: 3, left: 3 }, { top: 3, right: 3 },
            { bottom: 3, left: 3 }, { bottom: 3, right: 3 },
          ].map((pos, i) => (
            <div key={`rl-${i}`} style={{
              position: 'absolute', ...pos,
              width: 3, height: 3, borderRadius: '50%',
              backgroundColor: color,
              color,
              boxShadow: `0 0 6px ${color}`,
              animation: `ledGlow 1.5s ${i * 0.35}s ease-in-out infinite`,
              pointerEvents: 'none', zIndex: 3,
            }} />
          ))}

          {/* L6: Primary scan beam — sweeps vertically */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${color}88, ${color}, ${color}88, transparent)`,
            boxShadow: `0 0 24px 6px ${color}44`,
            animation: 'scanBeam 3s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* L7: Secondary diagonal scan — crosses at different angle */}
          <div style={{
            position: 'absolute', width: 2, height: '60%',
            background: `linear-gradient(180deg, transparent, ${color}55, transparent)`,
            boxShadow: `0 0 12px 2px ${color}22`,
            animation: 'diagScan 4s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* L8: Center crosshair */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 16, height: 16,
            animation: 'crosshairPulse 2.5s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 1,
          }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: `${color}30` }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: `${color}30` }} />
          </div>

          {/* L9: Left edge tick marks */}
          {Array.from({ length: 8 }, (_, i) => (
            <div key={`tick-${i}`} style={{
              position: 'absolute', left: 0,
              top: `${12 + i * 10.5}%`,
              width: i % 3 === 0 ? 8 : 4, height: 1,
              background: `${color}25`,
              pointerEvents: 'none', zIndex: 1,
            }} />
          ))}

          {/* L10: Signal equalizer waveform */}
          <div style={{
            position: 'absolute', bottom: 8, left: 10, right: 10, height: 18,
            display: 'flex', alignItems: 'flex-end', gap: 2,
            opacity: 0.3, pointerEvents: 'none', zIndex: 1,
          }}>
            {[3, 8, 5, 12, 7, 4, 10, 6, 14, 5, 8, 3, 11, 7, 4, 9, 6, 13, 5, 8, 3, 10, 7, 4].map((h, i) => (
              <div key={`bar-${i}`} style={{
                flex: 1, height: h, background: color, borderRadius: 1,
                opacity: 0.3 + (h / 14) * 0.7,
                animation: `barPulse ${0.8 + (i % 4) * 0.15}s ${i * 0.04}s ease-in-out infinite`,
              }} />
            ))}
          </div>

          {/* L11: Expanding pulse rings */}
          {[0, 1].map((i) => (
            <div key={`ring-${i}`} style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 24, height: 24, borderRadius: '50%',
              border: `1px solid ${color}`,
              transform: 'translate(-50%, -50%)',
              animation: `beaconExpand 2.5s ${i * 1.25}s ease-out infinite`,
              pointerEvents: 'none', zIndex: 1,
            }} />
          ))}

          {/* L12: Top energy conduit */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            borderRadius: '2px 2px 0 0',
            background: color,
            boxShadow: `0 0 14px ${color}66, 0 0 28px ${color}33`,
            animation: 'borderTrace 2s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* L13: Bottom accent mirror */}
          <div style={{
            position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 1,
            borderRadius: '0 0 1px 1px',
            background: `linear-gradient(90deg, transparent, ${color}44, ${color}22, ${color}44, transparent)`,
            animation: 'borderTrace 3s 0.5s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />
        </>
      )}

      {/* ═══════════════════════════════════════
          SUCCESS — Field Stabilization
          Calm, settled energy after completion
      ═══════════════════════════════════════ */}
      {isSuccess && (
        <>
          {/* Stable field background */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            border: `1px solid ${color}30`,
            background: `linear-gradient(135deg, ${color}06 0%, var(--color-surface) 50%)`,
            pointerEvents: 'none', zIndex: 0,
          }} />

          {/* Solid corner brackets */}
          {[
            { top: 4, left: 4, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
            { top: 4, right: 4, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
            { bottom: 4, left: 4, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
            { bottom: 4, right: 4, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', ...pos,
              width: 14, height: 14, borderRadius: 1,
              pointerEvents: 'none', zIndex: 2,
            }} />
          ))}

          {/* Corner LED dots — steady confirmation glow */}
          {[
            { top: 3, left: 3 }, { top: 3, right: 3 },
            { bottom: 3, left: 3 }, { bottom: 3, right: 3 },
          ].map((pos, i) => (
            <div key={`sl-${i}`} style={{
              position: 'absolute', ...pos,
              width: 2.5, height: 2.5, borderRadius: '50%',
              backgroundColor: color,
              boxShadow: `0 0 6px ${color}88`,
              animation: `ledGlow 2.5s ${i * 0.5}s ease-in-out infinite`,
              pointerEvents: 'none', zIndex: 3,
            }} />
          ))}

          {/* Completion sweep */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '40%',
            background: `linear-gradient(90deg, transparent, ${color}12, ${color}18, ${color}12, transparent)`,
            animation: 'completionSweep 5s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 1,
          }} />

          {/* Stable glow field */}
          <div style={{
            position: 'absolute', inset: -4, borderRadius: 'var(--radius)',
            boxShadow: `0 0 20px ${color}18, inset 0 0 20px ${color}08`,
            animation: 'fieldStabilize 3s ease-in-out infinite',
            pointerEvents: 'none', zIndex: -1,
          }} />

          {/* Top accent — calm solid */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            borderRadius: '2px 2px 0 0',
            background: `linear-gradient(90deg, ${color}, ${color}88, ${color})`,
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* Bottom accent — settled */}
          <div style={{
            position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 1,
            borderRadius: '0 0 1px 1px',
            background: `linear-gradient(90deg, transparent, ${color}30, ${color}18, ${color}30, transparent)`,
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* Calm signal bars — low steady waveform */}
          <div style={{
            position: 'absolute', bottom: 8, left: 10, right: 10, height: 14,
            display: 'flex', alignItems: 'flex-end', gap: 2,
            opacity: 0.2, pointerEvents: 'none', zIndex: 1,
          }}>
            {[6, 7, 5, 6, 7, 6, 5, 7, 6, 7, 5, 6, 7, 6, 5, 7, 6, 7, 5, 6, 7, 6, 5, 7].map((h, i) => (
              <div key={`sbar-${i}`} style={{
                flex: 1, height: h, background: color, borderRadius: 1,
                animation: `barPulse ${1.5 + (i % 3) * 0.2}s ${i * 0.06}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          FAILURE — Alert Protocol
          Urgent, aggressive warning signals
      ═══════════════════════════════════════ */}
      {isFailed && (
        <>
          {/* Alert base */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            border: `1px solid ${color}45`,
            background: `linear-gradient(135deg, ${color}0a 0%, var(--color-surface) 40%)`,
            pointerEvents: 'none', zIndex: 0,
          }} />

          {/* Blinking corner brackets */}
          {[
            { top: 4, left: 4, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
            { top: 4, right: 4, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
            { bottom: 4, left: 4, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
            { bottom: 4, right: 4, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', ...pos,
              width: 16, height: 16, borderRadius: 1,
              animation: `alertBlink 1.2s ${i * 0.2}s ease-in-out infinite`,
              pointerEvents: 'none', zIndex: 2,
            }} />
          ))}

          {/* Marching alert stripes */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            borderRadius: '3px 3px 0 0',
            background: `repeating-linear-gradient(-45deg, ${color}, ${color} 4px, transparent 4px, transparent 8px)`,
            backgroundSize: '14px 100%', animation: 'stripeMarch 0.8s linear infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* CRT scanlines overlay */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${color}05 2px, ${color}05 4px)`,
            pointerEvents: 'none', zIndex: 1, opacity: 0.5,
          }} />

          {/* Red alert pulse */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            background: `radial-gradient(ellipse at center, ${color}22, transparent 70%)`,
            animation: 'redFlash 2s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 1,
          }} />

          {/* Warning indicator dots — pulsing along bottom */}
          {Array.from({ length: 5 }, (_, i) => (
            <div key={`wd-${i}`} style={{
              position: 'absolute', bottom: 7,
              left: `${12 + i * 18}%`,
              width: 2.5, height: 2.5, borderRadius: '50%',
              backgroundColor: color,
              boxShadow: `0 0 6px ${color}`,
              animation: `alertBlink 1s ${i * 0.15}s ease-in-out infinite`,
              pointerEvents: 'none', zIndex: 2,
            }} />
          ))}

          {/* Side accent lines */}
          <div style={{
            position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 1,
            background: `linear-gradient(180deg, transparent, ${color}30, transparent)`,
            pointerEvents: 'none', zIndex: 1,
          }} />
          <div style={{
            position: 'absolute', right: 0, top: '15%', bottom: '15%', width: 1,
            background: `linear-gradient(180deg, transparent, ${color}30, transparent)`,
            pointerEvents: 'none', zIndex: 1,
          }} />

          {/* Chaotic error waveform */}
          <div style={{
            position: 'absolute', bottom: 8, left: 10, right: 10, height: 18,
            display: 'flex', alignItems: 'flex-end', gap: 2,
            opacity: 0.3, pointerEvents: 'none', zIndex: 1,
          }}>
            {[14, 3, 12, 2, 8, 13, 3, 11, 2, 14, 4, 10, 2, 13, 3, 9, 14, 2, 11, 4, 12, 3, 8, 14].map((h, i) => (
              <div key={`ebar-${i}`} style={{
                flex: 1, height: h, background: color, borderRadius: 1,
                opacity: 0.3 + (h / 14) * 0.7,
                animation: `barPulse ${0.5 + (i % 3) * 0.1}s ${i * 0.03}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          PENDING — Scanning Mode
          Searching, initializing, waiting
      ═══════════════════════════════════════ */}
      {isPending && (
        <>
          {/* Breathing base */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
            border: `1px dashed ${color}35`,
            background: 'var(--color-surface)',
            animation: 'breathe 3s ease-in-out infinite',
            pointerEvents: 'none', zIndex: 0,
          }} />

          {/* Dashed corner brackets */}
          {[
            { top: 4, left: 4, borderTop: `1px dashed ${color}50`, borderLeft: `1px dashed ${color}50` },
            { top: 4, right: 4, borderTop: `1px dashed ${color}50`, borderRight: `1px dashed ${color}50` },
            { bottom: 4, left: 4, borderBottom: `1px dashed ${color}50`, borderLeft: `1px dashed ${color}50` },
            { bottom: 4, right: 4, borderBottom: `1px dashed ${color}50`, borderRight: `1px dashed ${color}50` },
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', ...pos,
              width: 12, height: 12, borderRadius: 1,
              pointerEvents: 'none', zIndex: 2,
            }} />
          ))}

          {/* Orbiting electron */}
          <div style={{
            position: 'absolute', top: 'calc(50% - 3px)', left: 'calc(50% - 3px)',
            width: 3, height: 3, borderRadius: '50%',
            backgroundColor: color, boxShadow: `0 0 8px ${color}`,
            animation: 'orbitSpin 3s linear infinite',
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* Radar ping rings */}
          {[0, 1].map((i) => (
            <div key={`ping-${i}`} style={{
              position: 'absolute', top: 'calc(50% - 4px)', left: 'calc(50% - 4px)',
              width: 8, height: 8, borderRadius: '50%',
              border: `1px solid ${color}40`,
              animation: `radarPing 3s ${i * 1.5}s ease-out infinite`,
              pointerEvents: 'none', zIndex: 1,
            }} />
          ))}

          {/* Spinning progress arc */}
          <svg style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'progressArc 4s linear infinite',
            pointerEvents: 'none', zIndex: 1,
          }} width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke={`${color}12`} strokeWidth="1" />
            <circle cx="22" cy="22" r="18" fill="none" stroke={color} strokeWidth="1.5"
              strokeDasharray="28 85" strokeLinecap="round" opacity="0.5" />
          </svg>

          {/* Bottom initialization dots */}
          {Array.from({ length: 5 }, (_, i) => (
            <div key={`id-${i}`} style={{
              position: 'absolute', bottom: 7,
              left: `${20 + i * 14}%`,
              width: 2, height: 2, borderRadius: '50%',
              backgroundColor: color,
              animation: `initDotFade 2s ${i * 0.3}s ease-in-out infinite`,
              pointerEvents: 'none', zIndex: 2,
            }} />
          ))}

          {/* Faint center ring */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 50, height: 50, borderRadius: '50%',
            border: `1px dashed ${color}12`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none', zIndex: 1,
            animation: 'breathe 4s ease-in-out infinite',
          }} />
        </>
      )}

      {/* ── CARD CONTENT ── */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '2px 0 0',
      }}>
        {/* Card header */}
        <div style={ef.stepHeader} onClick={onExpand}>
          <div style={ef.stepHeaderLeft}>
            {/* Status beacon */}
            <div style={{
              position: 'relative',
              width: 9,
              height: 9,
              flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}66`,
                animation: isRunning ? 'beaconPulse 1.5s ease-in-out infinite' : 'none',
              }} />
              {isRunning && (
                <div style={{
                  position: 'absolute',
                  inset: -4,
                  borderRadius: '50%',
                  border: `1px solid ${color}44`,
                  animation: 'beaconRing 2s ease-out infinite',
                }} />
              )}
            </div>
            <div style={ef.stepNameCol}>
              <span style={ef.stepName}>{name}</span>
              <span style={{
                ...ef.stepCap,
                color,
                background: `${color}12`,
              }}>
                {step.capability || 'unknown'}
              </span>
            </div>
          </div>
          <div style={ef.stepHeaderRight}>
            {isRunning && <Loader2 size={11} style={{ color, animation: 'spin 1.5s linear infinite' }} />}
            {isSuccess && <CheckCircle2 size={11} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />}
            {isFailed && <AlertTriangle size={11} style={{ color, animation: 'alertPulse 1.5s ease-in-out infinite' }} />}
            <span style={{ ...ef.stepStatus, color }}>
              {step.status?.toUpperCase() || 'PENDING'}
            </span>
            {!expanded && step.durationMs != null && (
              <span style={ef.stepDuration}>{formatDuration(step.durationMs)}</span>
            )}
            {compact && <ChevronRight size={12} style={{
              color: 'var(--color-text-muted)',
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s',
            }} />}
          </div>
        </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          ...ef.stepDetails,
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Meta row */}
          <div style={ef.detailMeta}>
            {step.agentId && step.agentId !== 'unknown' && (
              <span style={ef.detailAgent}>Agent: {step.agentId}</span>
            )}
            {step.durationMs != null && (
              <span style={ef.detailDuration}>
                <Clock size={10} /> {formatDuration(step.durationMs)}
              </span>
            )}
            {step.retryCount > 0 && (
              <span style={ef.detailRetry}>
                <RotateCcw size={9} /> {step.retryCount} retries
              </span>
            )}
          </div>

          {/* Plan reasoning */}
          {planStep?.reasoning && (
            <div style={ef.detailSection}>
              <span style={ef.detailLabel}>Reasoning</span>
              <p style={ef.detailReasoning}>{planStep.reasoning}</p>
            </div>
          )}

          {/* Output */}
          {step.output != null && (
            <div style={ef.detailSection}>
              <span style={ef.detailLabel}>Output</span>
              <pre style={ef.detailPre}>
                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {step.error && (
            <div style={ef.detailError}>
              <span style={ef.detailErrCode}>{step.error.code}</span>
              <span style={ef.detailErrMsg}>{step.error.message}</span>
            </div>
          )}

          {/* Retry history */}
          {step.retryHistory?.length > 0 && (
            <div style={ef.detailSection}>
              <button onClick={() => setShowRetry(!showRetry)} style={ef.detailToggle}>
                <RotateCcw size={10} />
                <span>Retry History ({step.retryHistory.length})</span>
                {showRetry ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showRetry && (
                <div style={ef.retryList}>
                  {step.retryHistory.map((h, i) => (
                    <div key={i} style={ef.retryItem}>
                      <span style={ef.retryAttempt}>#{h.attempt}</span>
                      <span style={ef.retryAgent}>{h.agentId}</span>
                      <span style={ef.retryErr}>{h.error?.code}: {h.error?.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Usage */}
          {step.usage && (
            <div style={ef.detailSection}>
              <span style={ef.detailLabel}>Usage</span>
              <div style={ef.usageRow}>
                {step.usage.input_tokens != null && <span>In: {step.usage.input_tokens}</span>}
                {step.usage.output_tokens != null && <span>Out: {step.usage.output_tokens}</span>}
                {step.usage.latency_ms != null && <span>Latency: {step.usage.latency_ms}ms</span>}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
    RESULT PANEL — 智能格式化的输出面板
    紧跟 Hero 展示，自动解析输出类型并美化渲染
══════════════════════════════════════════════ */

function ResultPanel ({ output, status }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // 智能提取文本内容
  const text = useMemo(() => {
    if (output == null) return ''
    if (typeof output === 'string') return output
    if (typeof output === 'object' && output.result != null) {
      return typeof output.result === 'string' ? output.result : JSON.stringify(output.result, null, 2)
    }
    return JSON.stringify(output, null, 2)
  }, [output])

  const isJson = text.trim().startsWith('{') || text.trim().startsWith('[')
  const isLong = text.length > 600
  const displayText = isLong && !expanded ? text.slice(0, 600) + '...' : text
  const statusColor = TASK_STATUS_COLORS[status] || '#6b7280'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <section style={{
      ...s.resultPanel,
      borderColor: `${statusColor}25`,
      animation: 'heroReveal 0.5s 0.15s var(--ease-spring) backwards',
    }}>
      <style>{`
        @keyframes resultReveal {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 800px; }
        }
      `}</style>

      {/* Panel header */}
      <div style={s.resultHeader}>
        <div style={s.resultHeaderLeft}>
          <div style={{
            ...s.resultIcon,
            color: statusColor,
            background: `${statusColor}12`,
          }}>
            <FileText size={15} />
          </div>
          <div>
            <div style={s.resultTitle}>Mission Result</div>
            <div style={s.resultSubtitle}>
              {isJson ? 'JSON' : 'Text'} · {text.length.toLocaleString()} chars
            </div>
          </div>
        </div>
        <div style={s.resultActions}>
          <button onClick={handleCopy} style={s.resultCopyBtn}>
            {copied ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Output content */}
      <div style={s.resultBody}>
        {isJson ? (
          <pre style={s.resultPre}>{formatJson(displayText)}</pre>
        ) : (
          <div style={s.resultText}>
            {displayText.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {'\n'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expand / Collapse */}
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} style={s.resultExpandBtn}>
          {expanded ? 'Show less' : `Show all (${text.length.toLocaleString()} chars)`}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
    </section>
  )
}

/* JSON 高亮格式化 */
function formatJson (text) {
  try {
    const obj = JSON.parse(text)
    return JSON.stringify(obj, null, 2)
  } catch {
    return text
  }
}

/* ── Output renderer (for step detail) ── */
function renderOutput (output) {
  if (output == null) return null
  const text = typeof output === 'string'
    ? output
    : typeof output === 'object' && output.result != null
      ? (typeof output.result === 'string' ? output.result : JSON.stringify(output.result, null, 2))
      : JSON.stringify(output, null, 2)

  return <pre style={s.outputPre}>{text}</pre>
}

/* ══════════════════════════════════════════════
    STYLES
══════════════════════════════════════════════ */
const s = {
  page: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: '0 0 48px',
    animation: 'fadeIn 0.3s ease-out',
  },

  /* ── Ambient glow ── */
  ambientGlow: {
    position: 'fixed',
    top: 'var(--header-height)',
    left: 'var(--sidebar-width)',
    right: 0,
    height: 320,
    pointerEvents: 'none',
    zIndex: 0,
  },

  /* ── Skeleton loading ── */
  skeletonHero: {
    padding: '24px 28px',
  },
  skeletonLine: (w, h) => ({
    width: w,
    height: h,
    background: 'linear-gradient(90deg, var(--color-skeleton-base), var(--color-skeleton-shine), var(--color-skeleton-base))',
    backgroundSize: '200% 100%',
    borderRadius: 6,
    animation: 'shimmer 1.8s ease-in-out infinite',
  }),

  /* ── Error state ── */
  errorState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    minHeight: 400,
    padding: 48,
  },
  errorTitle: {
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
  },
  errorBack: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text-secondary)',
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    transition: 'all 0.15s',
    cursor: 'pointer',
  },

  /* ── Back button ── */
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text-muted)',
    padding: '6px 12px',
    margin: '20px 28px 0',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.15s',
    position: 'relative',
    zIndex: 1,
  },

  /* ══════════════════════════════════
      HERO
  ══════════════════════════════════ */
  hero: {
    position: 'relative',
    margin: '8px 28px 0',
    padding: 28,
    borderRadius: 'var(--radius-lg)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    zIndex: 1,
  },
  heroAura: {
    position: 'absolute',
    inset: -1,
    borderRadius: 'var(--radius-lg)',
    pointerEvents: 'none',
  },
  heroBeacon: {
    position: 'absolute',
    top: 28,
    right: 28,
    width: 40,
    height: 40,
  },
  beaconDot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 10,
    height: 10,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
  },
  beaconRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
  },
  heroLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontWeight: 600,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text)',
    letterSpacing: '-0.04em',
    margin: 0,
    lineHeight: 1.2,
  },
  cursor: {
    display: 'inline-block',
    width: 2,
    height: 20,
    background: 'var(--color-primary)',
    marginLeft: 3,
    verticalAlign: 'middle',
    animation: 'terminalBlink 1s step-end infinite',
  },
  heroDesc: {
    fontSize: 14,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: '10px 0 0',
    maxWidth: 640,
  },
  heroMetrics: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 16,
  },
  statusChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'var(--color-surface-hover)',
  },
  metricValue: {
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
  },

  /* Phase timeline */
  phaseTimeline: {
    display: 'flex',
    gap: 20,
    marginTop: 16,
    padding: '10px 14px',
    background: 'var(--color-surface-hover)',
    borderRadius: 'var(--radius-sm)',
  },
  phaseItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
  },
  phaseDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    flexShrink: 0,
  },
  phaseLabel: {
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: 9,
  },
  phaseTime: {
    color: 'var(--color-text-secondary)',
  },

  /* Cancel */
  cancelBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    color: 'var(--color-error)',
    border: '1px solid var(--color-error)44',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-error-dim)',
    transition: 'all 0.15s',
  },

  /* ══════════════════════════════════
      TIMELINE SPINE
  ══════════════════════════════════ */
  timelineContainer: {
    position: 'relative',
    marginLeft: 28,
    marginRight: 28,
    marginTop: 32,
    zIndex: 1,
  },
  spine: {
    position: 'absolute',
    left: 6,
    top: 0,
    bottom: 0,
    width: 1,
    background: 'linear-gradient(180deg, var(--color-border) 0%, var(--color-border) 85%, transparent 100%)',
    transformOrigin: 'top',
    animation: 'spineGrow 0.6s 0.3s var(--ease-out) backwards',
  },

  /* Timeline node */
  node: {
    display: 'flex',
    gap: 16,
    marginBottom: 24,
    position: 'relative',
  },
  nodeDot: {
    position: 'relative',
    width: 13,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 14,
    flexShrink: 0,
  },
  nodeDotInner: {
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  nodeContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  nodeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  nodeIcon: {
    display: 'flex',
    alignItems: 'center',
    opacity: 0.8,
  },
  nodeLabel: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  nodeActive: {
    fontSize: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid',
    letterSpacing: '0.08em',
  },
  nodeBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  /* ── Sticky bar ── */
  stickyBar: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 28px',
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--color-border)',
    animation: 'fadeIn 0.2s ease-out',
  },
  stickyLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  stickyDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  stickyId: {
    fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
  },
  stickyStatus: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  stickyRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  stickyMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
  },

  /* ══════════════════════════════════
      PLANNING SECTION
  ══════════════════════════════════ */
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 8,
  },
  planChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 12px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  planChipLabel: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
  planChipValue: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-text)',
  },

  /* Keywords */
  keywordList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 4,
  },
  keywordRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)',
  },
  keywordText: {
    color: 'var(--color-primary)',
  },
  keywordCap: {
    color: 'var(--color-text)',
  },

  /* Reasoning */
  sectionLabel: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
  reasoningList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  reasoningRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepIndex: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-primary)',
    minWidth: 28,
  },
  stepReasoning: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },

  /* ══════════════════════════════════
      RESULT PANEL
  ══════════════════════════════════ */
  resultPanel: {
    position: 'relative',
    margin: '12px 28px 0',
    padding: '20px 24px',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    zIndex: 1,
    overflow: 'hidden',
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  resultHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  resultIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 'var(--radius)',
    flexShrink: 0,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
  },
  resultSubtitle: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    marginTop: 2,
  },
  resultActions: {
    display: 'flex',
    gap: 8,
  },
  resultCopyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    padding: '5px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface-hover)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  resultBody: {
    padding: '16px 18px',
    background: 'var(--color-surface-hover)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    maxHeight: 400,
    overflow: 'auto',
  },
  resultPre: {
    margin: 0,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.7,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  resultText: {
    fontSize: 14,
    fontFamily: "'Space Grotesk', sans-serif",
    lineHeight: 1.8,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  resultExpandBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    marginTop: 12,
    padding: '8px 0',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },

  /* Step detail output (in ExecutionFlow) */
  outputPre: {
    margin: 0,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.7,
    color: 'var(--color-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },

  /* ══════════════════════════════════
      FEEDBACK
  ══════════════════════════════════ */
  autoScore: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: 'var(--color-primary-dim)',
    border: '1px solid rgba(245,166,35,0.15)',
    borderRadius: 'var(--radius-sm)',
  },
  autoScoreLabel: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
  autoScoreValue: {
    fontSize: 20,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    color: 'var(--color-primary)',
    letterSpacing: '-0.03em',
  },

  /* Feedback cards */
  fbCard: {
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  fbStars: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  fbRating: {
    marginLeft: 8,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
  },
  fbComment: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: '6px 0 0',
  },
  fbMeta: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    marginTop: 6,
    display: 'block',
  },

  /* Rating form */
  ratingForm: {
    padding: 16,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  starRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  starBtn: {
    padding: 4,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    lineHeight: 0,
  },
  ratingDisplay: {
    marginLeft: 10,
    fontSize: 16,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    color: 'var(--color-primary)',
    letterSpacing: '-0.02em',
  },
  commentRow: {
    display: 'flex',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    padding: '8px 14px',
    fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'var(--color-text)',
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  submitBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    fontSize: 12,
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    color: '#0a0b0f',
    background: 'var(--color-primary)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.15s',
  },
}

/* ══════════════════════════════════════════════
    EXECUTION FLOW STYLES
══════════════════════════════════════════════ */
const ef = {
  /* Header */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius) var(--radius) 0 0',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  strategyBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    padding: '5px 12px',
    borderRadius: 6,
    letterSpacing: '0.04em',
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
  },
  progressTrack: {
    width: 120,
    height: 4,
    borderRadius: 2,
    background: 'var(--color-load-track)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  /* ── Serial ── */
  serialWrap: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderTop: 'none',
    borderRadius: '0 0 var(--radius) var(--radius)',
    overflow: 'hidden',
  },
  serialTrack: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    gap: 0,
    width: '100%',
    overflow: 'hidden',
  },
  serialStepWrap: {
    display: 'flex',
    alignItems: 'center',
    flex: '1 1 0%',
    minWidth: 0,
    overflow: 'hidden',
  },

  /* Connector */
  connector: {
    display: 'flex',
    alignItems: 'center',
    width: 24,
    position: 'relative',
    flex: '0 0 24px',
  },
  connectorLine: {
    position: 'absolute',
    left: 2,
    right: 6,
    top: '50%',
    height: 2,
    borderRadius: 1,
    transition: 'background-color 0.3s',
  },
  connectorSignal: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: '50%',
    top: 'calc(50% - 2.5px)',
    zIndex: 1,
  },
  connectorArrow: {
    position: 'absolute',
    right: 1,
    top: 'calc(50% - 3px)',
    width: 0,
    height: 0,
    borderTop: '4px solid transparent',
    borderBottom: '4px solid transparent',
    borderLeftWidth: 5,
    borderLeftStyle: 'solid',
  },

  /* ── Parallel ── */
  parallelWrap: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderTop: 'none',
    borderRadius: '0 0 var(--radius) var(--radius)',
    padding: '0 16px 16px',
    overflow: 'hidden',
  },
  forkJoinNode: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '14px 0 10px',
  },
  forkDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  forkLabel: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.12em',
  },
  branchFork: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '0 20px',
    gap: 10,
  },
  branchLine: {
    width: 2,
    height: 24,
    borderLeft: '2px dashed var(--color-border)',
    transition: 'border-color 0.3s',
  },
  parallelGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12,
    padding: '8px 0',
  },
  branchCard: {
    position: 'relative',
  },
  branchIndex: {
    position: 'absolute',
    top: -10,
    left: 14,
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'var(--color-surface)',
    border: '1px solid',
    letterSpacing: '0.06em',
    zIndex: 1,
  },

  /* Strategy hint */
  strategyHint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border)',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface-hover)',
  },

  /* ── Single ── */
  singleWrap: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderTop: 'none',
    borderRadius: '0 0 var(--radius) var(--radius)',
    padding: 16,
  },

  /* ── Step Card ── */
  stepCard: {
    position: 'relative',
    padding: '10px 12px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    minWidth: 0,
    flex: '1 1 0%',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  stepCardFull: {
    minWidth: '100%',
  },
  stepAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: '3px 3px 0 0',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  stepBeacon: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  stepNameCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  stepName: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text)',
    fontFamily: "'Space Grotesk', sans-serif",
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stepCap: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
    width: 'fit-content',
  },
  stepHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  stepStatus: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  stepDuration: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
  },

  /* ── Expanded details ── */
  stepDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginTop: 14,
    paddingTop: 14,
    borderTop: '1px solid var(--color-border)',
    animation: 'nodeReveal 0.25s var(--ease-out)',
  },
  detailMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  detailAgent: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
  },
  detailDuration: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)',
  },
  detailRetry: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-warning)',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  detailReasoning: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    lineHeight: 1.6,
    fontStyle: 'italic',
    margin: 0,
  },
  detailPre: {
    margin: 0,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.7,
    color: 'var(--color-text)',
    background: 'var(--color-surface-hover)',
    padding: 14,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 200,
    overflow: 'auto',
  },
  detailError: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'var(--color-error-dim)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-error)33',
  },
  detailErrCode: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--color-error)',
    padding: '2px 8px',
    background: 'var(--color-error)15',
    borderRadius: 4,
  },
  detailErrMsg: {
    fontSize: 12,
    color: 'var(--color-error)',
    lineHeight: 1.5,
  },
  detailToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '5px 12px',
    cursor: 'pointer',
    width: 'fit-content',
  },
  retryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    marginTop: 6,
  },
  retryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
  },
  retryAttempt: {
    fontWeight: 600,
    color: 'var(--color-warning)',
    minWidth: 24,
  },
  retryAgent: {
    color: 'var(--color-text-secondary)',
    minWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  retryErr: {
    color: 'var(--color-error)',
    fontSize: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  usageRow: {
    display: 'flex',
    gap: 20,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)',
  },
}
