import { useMemo, useCallback } from 'react'
import ReactFlow, { Background, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'

const STATUS_COLOR = {
  pending: '#94a3b8',
  running: '#f59e0b',
  success: '#22c55e',
  failure: '#ef4444',
  cancelled: '#6b7280'
}

const STATUS_GLOW = {
  pending: '0 0 0px transparent',
  running: '0 0 16px rgba(245, 158, 11, 0.25)',
  success: '0 0 10px rgba(34, 197, 94, 0.15)',
  failure: '0 0 10px rgba(239, 68, 68, 0.15)',
  cancelled: '0 0 0px transparent'
}

function formatDuration (ms) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Custom node renderer
function StepNode ({ data }) {
  const { name, capability, status, durationMs, agentId } = data
  const color = STATUS_COLOR[status] || STATUS_COLOR.pending
  const isRunning = status === 'running'

  return (
    <div
      style={{
        minWidth: 168,
        background: `linear-gradient(135deg, ${color}0d 0%, ${color}05 100%)`,
        border: `2px solid ${color}`,
        borderRadius: 10,
        padding: '12px 16px',
        boxShadow: STATUS_GLOW[status],
        position: 'relative',
        transition: 'box-shadow 0.4s ease, border-color 0.3s ease',
        animation: isRunning ? 'flowNodePulse 2s ease-in-out infinite' : 'flowNodeAppear 0.4s ease-out'
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 12,
        right: 12,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${color}66, transparent)`,
        borderRadius: '0 0 2px 2px'
      }}
      />

      {/* Step name */}
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--color-text)',
        letterSpacing: '-0.02em',
        marginBottom: 6,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 140
      }}
      >
        {name}
      </div>

      {/* Capability badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        color: color,
        background: `${color}15`,
        padding: '2px 8px',
        borderRadius: 4,
        marginBottom: 8,
        letterSpacing: '0.02em',
        fontWeight: 500
      }}
      >
        <span style={{
          display: 'inline-block',
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: isRunning ? `0 0 6px ${color}` : undefined,
          animation: isRunning ? 'flowDotPulse 1.5s ease-in-out infinite' : undefined
        }}
        />
        {capability}
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8
      }}
      >
        <span style={{
          fontSize: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}
        >
          {status === 'running' ? 'Running' :
           status === 'success' ? 'Done' :
           status === 'failure' ? 'Failed' :
           status === 'cancelled' ? 'Stopped' :
           'Waiting'}
        </span>

        {durationMs != null && (
          <span style={{
            fontSize: 10,
            fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--color-text-secondary)'
          }}
          >
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* Injected keyframes */}
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

export function TaskFlow ({ steps = [], results = [] }) {
  // Merge steps with their results
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
        durationMs: result
          ? (result.finishedAt || Date.now()) - result.startedAt
          : step.durationMs,
        agentId: result?.agentId || step.agentId
      }
    })
  }, [steps, results])

  // Build nodes with horizontal layout
  const nodes = useMemo(() => {
    // Simple topological sort for positioning
    const indexed = new Map()
    mergedSteps.forEach((s, i) => indexed.set(s.stepId ?? s.stepIndex, i))

    // Track y-level for multi-row support
    const positions = {}
    const computePos = (stepId, x) => {
      if (positions[stepId] !== undefined) return
      const idx = indexed.get(stepId)
      if (idx === undefined) return

      const deps = mergedSteps[idx].dependsOn || []
      let maxX = x
      for (const dep of deps) {
        if (positions[dep] === undefined) computePos(dep, x)
        if (positions[dep] !== undefined) {
          maxX = Math.max(maxX, positions[dep].x + 260)
        }
      }

      // Count how many nodes at this x level to offset y
      const sameXCount = Object.values(positions).filter(p => Math.abs(p.x - maxX) < 10).length
      positions[stepId] = { x: maxX, y: sameXCount * 100 }
    }

    mergedSteps.forEach((s) => {
      const id = s.stepId ?? String(s.stepIndex)
      computePos(id, 0)
    })

    return mergedSteps.map((step) => {
      const id = step.stepId ?? String(step.stepIndex)
      const pos = positions[id] || { x: (step.stepIndex || 0) * 260, y: 0 }

      return {
        id,
        type: 'stepNode',
        position: pos,
        data: {
          name: step.name || step.description || `Step ${step.stepIndex}`,
          capability: step.capability || 'unknown',
          status: step.status || 'pending',
          durationMs: step.durationMs,
          agentId: step.agentId
        }
      }
    })
  }, [mergedSteps])

  // Build edges from dependencies
  const edges = useMemo(() => {
    const edgeList = []
    for (const step of mergedSteps) {
      const targetId = step.stepId ?? String(step.stepIndex)
      const deps = step.dependsOn || []

      // If no explicit dependsOn, chain sequentially by stepIndex
      if (deps.length === 0 && step.stepIndex > 0) {
        const prevStep = mergedSteps.find(s => s.stepIndex === step.stepIndex - 1)
        if (prevStep && !mergedSteps.some(s => (s.dependsOn || []).includes(prevStep.stepId ?? String(prevStep.stepIndex)))) {
          deps.push(prevStep.stepId ?? String(prevStep.stepIndex))
        }
      }

      for (const depId of deps) {
        const sourceId = String(depId)
        const sourceStep = mergedSteps.find(s => (s.stepId ?? String(s.stepIndex)) === sourceId)
        const sourceStatus = sourceStep?.status || 'pending'
        const targetStatus = step.status || 'pending'

        let edgeColor = 'var(--color-border)'
        let animated = false

        if (sourceStatus === 'success' && (targetStatus === 'running' || targetStatus === 'pending')) {
          edgeColor = STATUS_COLOR.success
          animated = targetStatus === 'running'
        } else if (sourceStatus === 'success' && targetStatus === 'success') {
          edgeColor = STATUS_COLOR.success
        } else if (sourceStatus === 'failure') {
          edgeColor = STATUS_COLOR.failure
        }

        edgeList.push({
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          animated,
          style: {
            stroke: edgeColor,
            strokeWidth: 2,
            transition: 'stroke 0.3s ease'
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: edgeColor
          }
        })
      }
    }
    return edgeList
  }, [mergedSteps])

  const defaultEdgeOptions = {
    style: { stroke: 'var(--color-border)', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-text-muted)' }
  }

  if (mergedSteps.length === 0) return null

  return (
    <div
      style={{
        height: 240,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden'
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color='var(--color-border)'
          gap={20}
          size={1}
        />
      </ReactFlow>
    </div>
  )
}
