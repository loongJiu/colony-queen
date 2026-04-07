import { useConnectionStore } from '../../stores/connection'
import { ThemeToggle } from '../common/ThemeToggle'
import { Wifi, WifiOff } from 'lucide-react'

export function Header () {
  const connected = useConnectionStore((s) => s.connected)

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.breadcrumb}>
          <span style={styles.breadcrumbDim}>Colony</span>
          <span style={styles.breadcrumbSep}>/</span>
          <span style={styles.breadcrumbActive}>Overview</span>
        </div>
      </div>

      <div style={styles.right}>
        <div style={{
          ...styles.connection,
          color: connected ? 'var(--color-success)' : 'var(--color-error)'
        }}
        >
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span style={styles.connectionText}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span style={{
            ...styles.connectionDot,
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

const styles = {
  header: {
    height: 'var(--header-height)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: 'var(--color-header-bg)',
    backdropFilter: 'blur(12px)',
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
