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
      <div style={s.left}>
        <div style={s.breadcrumb}>
          <span style={s.breadcrumbDim}>Colony</span>
          <span style={s.breadcrumbSep}>/</span>
          <span style={s.breadcrumbActive}>{label}</span>
        </div>
      </div>

      <div style={s.right}>
        <div style={{
          ...s.connection,
          color: connected ? 'var(--color-success)' : 'var(--color-error)'
        }}
        >
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span style={s.connectionText}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span style={{
            ...s.connectionDot,
            backgroundColor: connected ? 'var(--color-success)' : 'var(--color-error)',
            animation: connected ? 'header-pulse 2s ease-in-out infinite' : 'none'
          }}
          />
        </div>
        <ThemeToggle />
      </div>

      <style>{`
        @keyframes header-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
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
    padding: '0 24px',
    background: 'var(--color-header-bg)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 50
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontFamily: "'IBM Plex Mono', monospace"
  },
  breadcrumbDim: {
    color: 'var(--color-text-muted)'
  },
  breadcrumbSep: {
    color: 'var(--color-border)'
  },
  breadcrumbActive: {
    color: 'var(--color-text)',
    fontWeight: 500
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  connection: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 500,
    fontFamily: "'IBM Plex Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  connectionText: {
    fontSize: 11
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: '50%'
  }
}
