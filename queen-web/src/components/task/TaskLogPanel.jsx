import { useEffect, useRef, useState, useMemo } from 'react'
import { Terminal, Circle, Info, AlertTriangle, XCircle, ChevronDown, ChevronRight, Filter } from 'lucide-react'

const SOURCE_STYLES = {
  planner: { color: 'var(--color-info)', label: 'planner' },
  executor: { color: 'var(--color-primary)', label: 'executor' },
  agent: { color: 'var(--color-success)', label: 'agent' },
  system: { color: 'var(--color-text-muted)', label: 'system' }
}

const LEVEL_STYLES = {
  info: { color: 'var(--color-info)', icon: Info, label: 'INFO' },
  warn: { color: 'var(--color-warning)', icon: AlertTriangle, label: 'WARN' },
  error: { color: 'var(--color-error)', icon: XCircle, label: 'ERROR' }
}

function formatTime (ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function hasExtra (entry) {
  const knownKeys = ['taskId', 'source', 'message', 'timestamp', 'level']
  return Object.keys(entry).some(k => !knownKeys.includes(k))
}

function getExtra (entry) {
  const knownKeys = ['taskId', 'source', 'message', 'timestamp', 'level']
  const extra = {}
  for (const [k, v] of Object.entries(entry)) {
    if (!knownKeys.includes(k)) extra[k] = v
  }
  return extra
}

function LogEntry ({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const src = SOURCE_STYLES[entry.source] || SOURCE_STYLES.system
  const level = entry.level || 'info'
  const lvl = LEVEL_STYLES[level] || LEVEL_STYLES.info
  const LevelIcon = lvl.icon
  const hasExtraFields = hasExtra(entry)
  const extraData = hasExtraFields ? getExtra(entry) : null

  return (
    <div>
      <div
        style={{
          ...styles.logRow,
          background: expanded ? 'var(--color-surface-hover)' : undefined,
          cursor: hasExtraFields ? 'pointer' : 'default'
        }}
        onClick={() => hasExtraFields && setExpanded(!expanded)}
      >
        {/* Timestamp */}
        <span style={styles.timestamp}>
          {formatTime(entry.timestamp)}
        </span>

        {/* Level badge */}
        <span style={{
          ...styles.levelBadge,
          color: lvl.color,
          border: `1px solid ${lvl.color}33`,
          background: `${lvl.color}0d`
        }}
        >
          <LevelIcon size={8} style={{ flexShrink: 0 }} />
          {lvl.label}
        </span>

        {/* Source badge */}
        <span style={{
          ...styles.sourceBadge,
          color: src.color,
          border: `1px solid ${src.color}33`,
          background: `${src.color}0d`
        }}
        >
          <Circle size={5} fill={src.color} style={{ flexShrink: 0 }} />
          {src.label}
        </span>

        {/* Message */}
        <span style={styles.message}>{entry.message}</span>

        {/* Expand toggle */}
        {hasExtraFields && (
          <span style={styles.expandIcon}>
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        )}
      </div>

      {/* Extra fields (expanded) */}
      {expanded && extraData && (
        <div style={styles.extraBlock}>
          <pre style={styles.extraPre}>{JSON.stringify(extraData, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export function TaskLogPanel ({ logs = [], maxHeight = 320 }) {
  const listRef = useRef(null)
  const [sourceFilter, setSourceFilter] = useState(null)
  const [levelFilter, setLevelFilter] = useState(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
    if (atBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs.length])

  const filteredLogs = useMemo(() => {
    return logs.filter(entry => {
      if (sourceFilter && entry.source !== sourceFilter) return false
      if (levelFilter && (entry.level || 'info') !== levelFilter) return false
      return true
    })
  }, [logs, sourceFilter, levelFilter])

  // Get unique sources from logs
  const sources = useMemo(() => {
    const set = new Set(logs.map(l => l.source).filter(Boolean))
    return [...set]
  }, [logs])

  if (logs.length === 0) {
    return (
      <div style={styles.empty}>
        <Terminal size={20} strokeWidth={1.5} style={{ opacity: 0.3 }} />
        <span style={styles.emptyText}>Waiting for logs...</span>
      </div>
    )
  }

  return (
    <div style={{ ...styles.container, maxHeight }}>
      {/* Header bar */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Terminal size={12} style={{ color: 'var(--color-text-muted)' }} />
          <span style={styles.headerTitle}>Real-time Logs</span>
          <span style={styles.logCount}>{filteredLogs.length}{filteredLogs.length !== logs.length ? ` / ${logs.length}` : ''}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <Filter size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          {/* Source filters */}
          {sources.map(src => {
            const srcStyle = SOURCE_STYLES[src]
            const active = sourceFilter === src
            return (
              <button
                key={src}
                onClick={() => setSourceFilter(active ? null : src)}
                style={{
                  ...styles.filterBtn,
                  color: active ? srcStyle?.color : 'var(--color-text-muted)',
                  borderColor: active ? (srcStyle?.color || 'var(--color-primary)') : 'transparent',
                  background: active ? `${srcStyle?.color || 'var(--color-primary)'}0d` : 'transparent'
                }}
              >
                {src}
              </button>
            )
          })}
        </div>
        <div style={styles.filterGroup}>
          {/* Level filters */}
          {Object.entries(LEVEL_STYLES).map(([key, cfg]) => {
            const active = levelFilter === key
            return (
              <button
                key={key}
                onClick={() => setLevelFilter(active ? null : key)}
                style={{
                  ...styles.filterBtn,
                  color: active ? cfg.color : 'var(--color-text-muted)',
                  borderColor: active ? cfg.color : 'transparent',
                  background: active ? `${cfg.color}0d` : 'transparent'
                }}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Log entries */}
      <div ref={listRef} style={styles.logList}>
        {filteredLogs.map((entry, i) => (
          <LogEntry key={i} entry={entry} />
        ))}
        {filteredLogs.length === 0 && (
          <div style={styles.noMatch}>No logs match current filters</div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface-hover)'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  logCount: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid var(--color-border)'
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 14px',
    borderBottom: '1px solid var(--color-border)',
    gap: 8,
    flexWrap: 'wrap'
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  filterBtn: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    transition: 'all 0.15s',
    cursor: 'pointer'
  },
  logList: {
    overflow: 'auto',
    padding: '6px 0',
    flex: 1
  },
  logRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '4px 14px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    lineHeight: 1.6,
    transition: 'background 0.1s'
  },
  timestamp: {
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontSize: 10,
    minWidth: 82
  },
  levelBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 8,
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    minWidth: 48,
    letterSpacing: '0.04em'
  },
  sourceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    minWidth: 58,
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  },
  message: {
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-word',
    flex: 1
  },
  expandIcon: {
    color: 'var(--color-text-muted)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '2px 0'
  },
  extraBlock: {
    padding: '4px 14px 6px 180px',
    background: 'var(--color-surface-hover)'
  },
  extraPre: {
    margin: 0,
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  noMatch: {
    textAlign: 'center',
    padding: '16px 0',
    fontSize: 11,
    color: 'var(--color-text-muted)',
    fontStyle: 'italic'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '32px 16px',
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)'
  },
  emptyText: {
    fontSize: 12,
    opacity: 0.6
  }
}
