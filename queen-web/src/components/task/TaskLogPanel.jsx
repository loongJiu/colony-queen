import { useEffect, useRef } from 'react'
import { Terminal, Circle } from 'lucide-react'

const SOURCE_STYLES = {
  planner: { color: 'var(--color-info)', label: 'planner' },
  executor: { color: 'var(--color-primary)', label: 'executor' },
  agent: { color: 'var(--color-success)', label: 'agent' },
  system: { color: 'var(--color-text-muted)', label: 'system' }
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

export function TaskLogPanel ({ logs = [], maxHeight = 320 }) {
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    // 仅在用户已滚动到接近底部时自动跟随
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
    if (atBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs.length])

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
        </div>
        <span style={styles.logCount}>{logs.length}</span>
      </div>

      {/* Log entries */}
      <div ref={listRef} style={styles.logList}>
        {logs.map((entry, i) => {
          const src = SOURCE_STYLES[entry.source] || SOURCE_STYLES.system
          return (
            <div key={i} style={styles.logRow}>
              {/* Timestamp */}
              <span style={styles.timestamp}>
                {formatTime(entry.timestamp)}
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
            </div>
          )
        })}
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
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid var(--color-border)'
  },
  logList: {
    overflow: 'auto',
    padding: '6px 0',
    flex: 1
  },
  logRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '4px 14px',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    lineHeight: 1.6,
    transition: 'background 0.1s'
  },
  timestamp: {
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontSize: 10,
    minWidth: 90
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
    minWidth: 64,
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  },
  message: {
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-word',
    flex: 1
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
