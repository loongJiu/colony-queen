import { useMemo, useState, useCallback } from 'react'
import ReactFlow, { Background, MarkerType, getBezierPath, BaseEdge } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Link2, GitFork, CircleDot, Loader2,
  X, RotateCcw, ChevronDown, ChevronUp
} from 'lucide-react'

const STATUS_COLOR = {
  pending: '#94a3b8',
  running: '#f59e0b',
  success: '#22c55e',
  failure: '#ef4444',
  cancelled: '#6b7280'
}

const STRATEGY_CONFIG = {
  single: { label: 'Single Step', icon: CircleDot, color: '#818cf8' },
  serial: { label: 'Serial', icon: Link2, color: '#f59e0b' },
  parallel: { label: 'Parallel', icon: GitFork, color: '#22c55e' }
}

const PHASE_MAP = {
  pending: { label: 'Pending', color: '#6366f1' },
  running: { label: 'Executing', color: '#f59e0b' },
  success: { label: 'Complete', color: '#22c55e' },
  failure: { label: 'Failed', color: '#ef4444' },
  partial: { label: 'Partial', color: '#f97316' },
  cancelled: { label: 'Cancelled', color: '#6b7280' }
}

function formatDuration (ms) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── 自定义节点 ──────────────────────────────────

function StepNode ({ data }) {
  const { name, capability, status, durationMs, agentId, retryCount, _selected, _strategy } = data
  const color = STATUS_COLOR[status] || STATUS_COLOR.pending
  const isRunning = status === 'running'

  return (
    <div style={{
      minWidth: _strategy === 'parallel' ? 200 : 168,
      background: _selected
        ? `linear-gradient(135deg, ${color}20 0%, ${color}0a 100%)`
        : `linear-gradient(135deg, ${color}0d 0%, ${color}05 100%)`,
      border: `2px solid ${_selected ? color : color}88`,
      borderRadius: 10,
      padding: '12px 16px',
      boxShadow: _selected
        ? `0 0 20px ${color}40, inset 0 0 12px ${color}08`
        : isRunning ? '0 0 16px rgba(245, 158, 11, 0.25)' : 'none',
      position: 'relative',
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease',
      animation: isRunning ? 'flowNodePulse 2s ease-in-out infinite' : 'flowNodeAppear 0.4s ease-out',
      cursor: 'pointer'
    }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 12, right: 12, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}66, transparent)`,
        borderRadius: '0 0 2px 2px'
      }}
      />
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--color-text)',
        letterSpacing: '-0.02em', marginBottom: 6,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170
      }}
      >
        {name}
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        color, background: `${color}15`, padding: '2px 8px', borderRadius: 4,
        marginBottom: 6, letterSpacing: '0.02em', fontWeight: 500
      }}
      >
        <span style={{
          display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
          backgroundColor: color,
          boxShadow: isRunning ? `0 0 6px ${color}` : undefined,
          animation: isRunning ? 'flowDotPulse 1.5s ease-in-out infinite' : undefined
        }}
        />
        {capability}
      </div>
      {agentId && agentId !== 'unknown' && (
        <div style={{
          fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--color-text-muted)', marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170
        }}
        >
          {agentId}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em'
        }}
        >
          {isRunning ? 'Running' : status === 'success' ? 'Done' : status === 'failure' ? 'Failed' : 'Waiting'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {retryCount > 0 && (
            <span style={{
              fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--color-warning)', background: 'var(--color-warning)15',
              padding: '1px 5px', borderRadius: 3,
              display: 'inline-flex', alignItems: 'center', gap: 3
            }}
            >
              <RotateCcw size={8} />{retryCount}
            </span>
          )}
          {durationMs != null && (
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-secondary)' }}>
              {formatDuration(durationMs)}
            </span>
          )}
        </div>
      </div>
      <style>{flowKeyframes}</style>
    </div>
  )
}

const flowKeyframes = `
@keyframes flowNodePulse {
  0%, 100% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.15); }
  50% { box-shadow: 0 0 24px rgba(245, 158, 11, 0.3); }
}
@keyframes flowNodeAppear {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes flowDotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`

const nodeTypes = { stepNode: StepNode }

// ── 自定义动画边 ──────────────────────────────────

function AnimatedEdge ({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style = {}, markerEnd, data
}) {
  const [edgePath] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition
  })

  const isRunning = data?.isRunning ?? false
  const edgeColor = data?.color ?? '#94a3b8'

  return (
    <>
      {/* 底层：完整路径（始终可见） */}
      <path
        d={edgePath}
        fill='none'
        stroke={edgeColor}
        strokeWidth={2}
        markerEnd={markerEnd}
      />
      {/* 顶层：动画虚线（仅 running 时） */}
      {isRunning && (
        <path
          d={edgePath}
          fill='none'
          stroke={edgeColor}
          strokeWidth={2}
          strokeDasharray='6 3'
          className='react-flow__edge-path'
          style={{
            animation: 'dashdraw 0.5s linear infinite',
            filter: `drop-shadow(0 0 4px ${edgeColor}66)`
          }}
        />
      )}
    </>
  )
}

const edgeTypes = { animatedEdge: AnimatedEdge }

// ── 步骤详情面板 ──────────────────────────────────

function StepDetailPanel ({ step, result, planStep, onClose }) {
  const [showRetry, setShowRetry] = useState(false)
  const status = result?.status || 'pending'
  const color = STATUS_COLOR[status] || STATUS_COLOR.pending

  return (
    <div style={detailStyles.panel}>
      <div style={detailStyles.header}>
        <div style={detailStyles.headerLeft}>
          <div style={{ ...detailStyles.dot, backgroundColor: color }} />
          <span style={detailStyles.title}>{step.name || step.description || `Step ${(step.stepIndex ?? 0) + 1}`}</span>
        </div>
        <button onClick={onClose} style={detailStyles.closeBtn}><X size={14} /></button>
      </div>
      <div style={detailStyles.metaRow}>
        <span style={detailStyles.cap}>{step.capability}</span>
        {result?.agentId && result.agentId !== 'unknown' && (
          <span style={detailStyles.agent}>Agent: {result.agentId}</span>
        )}
        {result && (
          <span style={detailStyles.dur}>{formatDuration((result.finishedAt || Date.now()) - result.startedAt)}</span>
        )}
        <span style={{ ...detailStyles.st, color }}>{status.toUpperCase()}</span>
      </div>
      {planStep?.reasoning && (
        <div style={detailStyles.section}>
          <span style={detailStyles.label}>Reasoning</span>
          <p style={detailStyles.reasoning}>{planStep.reasoning}</p>
        </div>
      )}
      {result?.output != null && (
        <div style={detailStyles.section}>
          <span style={detailStyles.label}>Output</span>
          <pre style={detailStyles.pre}>{typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}</pre>
        </div>
      )}
      {result?.error && (
        <div style={detailStyles.errBlock}>
          <span style={detailStyles.errCode}>{result.error.code}</span>
          <span style={detailStyles.errMsg}>{result.error.message}</span>
        </div>
      )}
      {result?.retryHistory?.length > 0 && (
        <div style={detailStyles.section}>
          <button style={detailStyles.toggleBtn} onClick={() => setShowRetry(!showRetry)}>
            <RotateCcw size={11} />
            <span>Retry History ({result.retryHistory.length})</span>
            {showRetry ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showRetry && (
            <div style={detailStyles.retryList}>
              {result.retryHistory.map((h, i) => (
                <div key={i} style={detailStyles.retryItem}>
                  <span style={detailStyles.retryAttempt}>#{h.attempt}</span>
                  <span style={detailStyles.retryAgent}>{h.agentId}</span>
                  <span style={detailStyles.retryErr}>{h.error?.code}: {h.error?.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {result?.usage && (
        <div style={detailStyles.section}>
          <span style={detailStyles.label}>Usage</span>
          <div style={detailStyles.usageRow}>
            {result.usage.input_tokens != null && <span>In: {result.usage.input_tokens}</span>}
            {result.usage.output_tokens != null && <span>Out: {result.usage.output_tokens}</span>}
            {result.usage.latency_ms != null && <span>Latency: {result.usage.latency_ms}ms</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 主组件 ──────────────────────────────────────

export function TaskFlow ({ steps = [], results = [], strategy = 'single', taskStatus = 'pending', planSteps, onCancel }) {
  const [selectedStepIndex, setSelectedStepIndex] = useState(null)

  const mergedSteps = useMemo(() => {
    const resultMap = {}
    for (const r of results) {
      resultMap[r.stepIndex] = r
    }
    return steps.map((step) => {
      const result = resultMap[step.stepIndex]
      return {
        ...step,
        status: result?.status || step.status || 'pending',
        durationMs: result ? (result.finishedAt || Date.now()) - result.startedAt : step.durationMs,
        agentId: result?.agentId || step.agentId,
        retryCount: result?.retryCount || 0,
        retryHistory: result?.retryHistory || []
      }
    })
  }, [steps, results])

  const completedCount = results.filter(r => r.status === 'success').length
  const totalCount = steps.length
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const phase = PHASE_MAP[taskStatus] || PHASE_MAP.pending
  const stratConfig = STRATEGY_CONFIG[strategy] || STRATEGY_CONFIG.single
  const StrategyIcon = stratConfig.icon

  const handleNodeClick = useCallback((event, node) => {
    const idx = node.data.stepIndex
    setSelectedStepIndex(prev => prev === idx ? null : idx)
  }, [])

  // ── 布局：根据策略区分 ──
  const { nodes, edges } = useMemo(() => {
    const nodeList = []
    const edgeList = []

    if (strategy === 'parallel') {
      // ── 并行布局：所有节点水平排列在同一行 ──
      mergedSteps.forEach((step, i) => {
        const id = step.stepId ?? String(step.stepIndex)
        nodeList.push({
          id,
          type: 'stepNode',
          position: { x: i * 260, y: 0 },
          data: {
            name: step.name || step.description || `Step ${step.stepIndex}`,
            capability: step.capability || 'unknown',
            status: step.status || 'pending',
            durationMs: step.durationMs,
            agentId: step.agentId,
            retryCount: step.retryCount,
            stepIndex: step.stepIndex,
            _selected: selectedStepIndex === step.stepIndex,
            _strategy: 'parallel'
          }
        })
      })
      // 并行策略：无边（各自独立）
      // 但添加一条分隔线效果通过 "split → merge" 虚线
    } else {
      // ── 串行/单步布局：水平链式排列 ──
      mergedSteps.forEach((step, i) => {
        const id = step.stepId ?? String(step.stepIndex)
        nodeList.push({
          id,
          type: 'stepNode',
          position: { x: i * 280, y: 0 },
          data: {
            name: step.name || step.description || `Step ${step.stepIndex}`,
            capability: step.capability || 'unknown',
            status: step.status || 'pending',
            durationMs: step.durationMs,
            agentId: step.agentId,
            retryCount: step.retryCount,
            stepIndex: step.stepIndex,
            _selected: selectedStepIndex === step.stepIndex,
            _strategy: strategy
          }
        })
      })

      // 串行策略：按序连线（实线 + 动画箭头）
      for (let i = 1; i < mergedSteps.length; i++) {
        const sourceId = mergedSteps[i - 1].stepId ?? String(mergedSteps[i - 1].stepIndex)
        const targetId = mergedSteps[i].stepId ?? String(mergedSteps[i].stepIndex)
        const sourceStatus = mergedSteps[i - 1].status || 'pending'
        const targetStatus = mergedSteps[i].status || 'pending'

        let edgeColor = '#94a3b8'
        let isRunning = false

        if (sourceStatus === 'success' && (targetStatus === 'running' || targetStatus === 'pending')) {
          edgeColor = STATUS_COLOR.success
          isRunning = targetStatus === 'running'
        } else if (sourceStatus === 'success' && targetStatus === 'success') {
          edgeColor = STATUS_COLOR.success
        } else if (sourceStatus === 'failure') {
          edgeColor = STATUS_COLOR.failure
        }

        edgeList.push({
          id: `e-${sourceId}-${targetId}`,
          type: 'animatedEdge',
          source: sourceId,
          target: targetId,
          data: { color: edgeColor, isRunning },
          markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: edgeColor }
        })
      }
    }

    return { nodes: nodeList, edges: edgeList }
  }, [mergedSteps, strategy, selectedStepIndex])

  const selectedStep = selectedStepIndex !== null ? steps.find(s => s.stepIndex === selectedStepIndex) : null
  const selectedResult = selectedStepIndex !== null ? results.find(r => r.stepIndex === selectedStepIndex) : null
  const selectedPlanStep = planSteps?.[selectedStepIndex]

  if (mergedSteps.length === 0) return null

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden'
    }}
    >
      {/* ── Header: 策略 + 阶段 + 进度 ── */}
      <div style={headerStyles.bar}>
        <div style={headerStyles.left}>
          <div style={{
            ...headerStyles.badge,
            color: stratConfig.color,
            background: `${stratConfig.color}12`,
            border: `1px solid ${stratConfig.color}33`
          }}
          >
            <StrategyIcon size={12} />
            <span>{stratConfig.label}</span>
          </div>
          <div style={{
            ...headerStyles.badge,
            color: phase.color,
            background: `${phase.color}12`,
            border: `1px solid ${phase.color}33`
          }}
          >
            {taskStatus === 'running' && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />}
            <span>{phase.label}</span>
          </div>
        </div>
        <div style={headerStyles.progressWrap}>
          <div style={headerStyles.progressTrack}>
            <div style={{
              ...headerStyles.progressFill,
              width: `${progressPct}%`,
              backgroundColor: phase.color,
              boxShadow: taskStatus === 'running' ? `0 0 8px ${phase.color}44` : 'none'
            }}
            />
          </div>
          <span style={headerStyles.progressLabel}>{completedCount}/{totalCount}</span>
        </div>
      </div>

      {/* ── ReactFlow 画布 ── */}
      <div style={{ height: 200 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.35 }}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color='var(--color-border)' gap={20} size={1} />
        </ReactFlow>
      </div>

      {/* ── 策略视觉提示 ── */}
      {strategy === 'serial' && mergedSteps.length > 1 && (
        <div style={headerStyles.strategyHint}>
          <span style={{ color: STRATEGY_CONFIG.serial.color, fontSize: 13, fontWeight: 700 }}>&rarr;</span>
          <span style={headerStyles.strategyHintText}>Sequential: steps run one after another</span>
          <span style={{ color: STRATEGY_CONFIG.serial.color, fontSize: 13, fontWeight: 700 }}>&rarr;</span>
        </div>
      )}
      {strategy === 'parallel' && mergedSteps.length > 1 && (
        <div style={headerStyles.strategyHint}>
          <span style={{ color: STRATEGY_CONFIG.parallel.color, fontSize: 13, fontWeight: 700 }}>&darr;&uarr;</span>
          <span style={headerStyles.strategyHintText}>{mergedSteps.length} branches run concurrently</span>
          <span style={{ color: STRATEGY_CONFIG.parallel.color, fontSize: 13, fontWeight: 700 }}>&darr;&uarr;</span>
        </div>
      )}

      {/* ── 详情面板 / 点击提示 ── */}
      {selectedStepIndex === null ? (
        <div style={headerStyles.hint}>Click a node to view details</div>
      ) : (
        <StepDetailPanel
          step={selectedStep}
          result={selectedResult}
          planStep={selectedPlanStep}
          onClose={() => setSelectedStepIndex(null)}
        />
      )}

      <style>{flowKeyframes}</style>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}

// ── 样式 ──────────────────────────────────────

const headerStyles = {
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 14px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface-hover)',
    gap: 12, flexWrap: 'wrap'
  },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
    padding: '3px 8px', borderRadius: 4, letterSpacing: '0.03em'
  },
  progressWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  progressTrack: {
    width: 80, height: 4, borderRadius: 2,
    background: 'var(--color-load-track)', overflow: 'hidden'
  },
  progressFill: {
    height: '100%', borderRadius: 2,
    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  progressLabel: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)', fontWeight: 500
  },
  strategyHint: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '6px 14px',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-surface-hover)'
  },
  strategyHintText: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)', fontWeight: 500, letterSpacing: '0.02em'
  },
  hint: {
    textAlign: 'center', padding: '6px 0',
    fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic'
  }
}

const detailStyles = {
  panel: {
    margin: '14px', padding: 16,
    background: 'var(--color-surface-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    display: 'flex', flexDirection: 'column', gap: 12,
    animation: 'flowNodeAppear 0.25s ease-out'
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  title: {
    fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  closeBtn: {
    display: 'flex', alignItems: 'center',
    color: 'var(--color-text-muted)', padding: 4,
    borderRadius: 4, transition: 'color 0.15s', cursor: 'pointer'
  },
  metaRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  cap: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-primary)', background: 'var(--color-primary-dim)',
    padding: '2px 8px', borderRadius: 3
  },
  agent: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)'
  },
  dur: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)'
  },
  st: {
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600, marginLeft: 'auto'
  },
  section: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.04em'
  },
  reasoning: {
    fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5,
    fontStyle: 'italic', margin: 0
  },
  pre: {
    margin: 0, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5, color: 'var(--color-text)',
    background: 'var(--color-surface)', padding: 10,
    borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    maxHeight: 200, overflow: 'auto'
  },
  errBlock: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', background: 'var(--color-error-dim)',
    borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-error)33'
  },
  errCode: {
    fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600, color: 'var(--color-error)',
    padding: '1px 6px', background: 'var(--error)15', borderRadius: 3
  },
  errMsg: { fontSize: 12, color: 'var(--color-error)', lineHeight: 1.4 },
  toggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', padding: '4px 10px',
    cursor: 'pointer', transition: 'all 0.15s', width: 'fit-content'
  },
  retryList: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 2 },
  retryItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)', padding: '3px 0'
  },
  retryAttempt: { fontWeight: 600, color: 'var(--color-warning)', minWidth: 20 },
  retryAgent: {
    color: 'var(--color-text-secondary)', minWidth: 80,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  retryErr: {
    color: 'var(--color-error)', fontSize: 9,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  usageRow: {
    display: 'flex', gap: 16,
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-secondary)'
  }
}
