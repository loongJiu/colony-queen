import { useLocation } from 'react-router-dom'
import { useConnectionStore } from '../../stores/connection'
import { ThemeToggle } from '../common/ThemeToggle'
import { Wifi, WifiOff } from 'lucide-react'

const ROUTE_LABELS = {
  '/': 'Overview',
  '/tasks': 'Tasks',
  '/agents': 'Agents',
  '/sessions': 'Sessions'
}

function getBreadcrumbLabel (pathname) {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  if (pathname.startsWith('/sessions/')) return 'Session Detail'
  if (pathname.startsWith('/tasks/')) return 'Task Detail'
  if (pathname.startsWith('/agents/') && pathname.endsWith('/profile')) return 'Agent Profile'
  if (pathname.startsWith('/agents/')) return 'Agent Detail'
  return 'Overview'
}

export function Header () {
  const connected = useConnectionStore((s) => s.connected)
  const location = useLocation()
  const label = getBreadcrumbLabel(location.pathname)

  return (
    <header style={s.header}>
      {/* Signal bar — thin top line showing connection */}
      <div style={s.signalBar}>
        <div style={{
          ...s.signalStream,
          background: connected
            ? 'linear-gradient(90deg, transparent, var(--color-primary), transparent)'
            : 'linear-gradient(90deg, transparent, var(--color-error), transparent)',
          animation: connected ? 'dataStream 3s linear infinite' : 'pulse 2s ease-in-out infinite',
        }} />
      </div>

      <div style={s.left}>
        <div style={s.breadcrumb}>
          <span style={s.breadcrumbPrefix}>COLONY://</span>
          <span style={s.breadcrumbActive}>{label.toUpperCase()}</span>
        </div>
      </div>

      <div style={s.right}>
        <div style={{
          ...s.connection,
          color: connected ? 'var(--color-primary)' : 'var(--color-error)',
        }}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span style={s.connectionText}>
            {connected ? 'SYNC' : 'OFFLINE'}
          </span>
          <span style={{
            ...s.connectionDot,
            backgroundColor: connected ? 'var(--color-primary)' : 'var(--color-error)',
            boxShadow: connected ? '0 0 6px var(--color-primary-glow)' : '0 0 6px rgba(255,45,85,0.3)',
            animation: connected ? 'signalBlink 2s ease-in-out infinite' : 'pulse 1s ease-in-out infinite',
          }} />
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}

const s = {
  header: {
    height: 'var(--header-height)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    background: 'var(--color-header-bg)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },

  /* Signal bar — thin animated top border */
  signalBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    overflow: 'hidden',
  },
  signalStream: {
    width: '30%',
    height: '100%',
  },

  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
  },
  breadcrumbPrefix: {
    color: 'var(--color-text-muted)',
    fontSize: 10,
    letterSpacing: '0.05em',
  },
  breadcrumbActive: {
    color: 'var(--color-primary)',
    fontWeight: 600,
    letterSpacing: '0.08em',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  connection: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 9,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  connectionText: {
    fontSize: 9,
  },
  connectionDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
  },
}
