import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, ListTodo, Bot } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/agents', icon: Bot, label: 'Agents' }
]

export function Sidebar () {
  const location = useLocation()

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logo}>
        <span style={styles.logoIcon}>&#x1F41D;</span>
        <div style={styles.logoText}>
          <span style={styles.logoTitle}>Colony</span>
          <span style={styles.logoSub}>Queen</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to
          return (
            <NavLink
              key={to}
              to={to}
              style={{
                ...styles.link,
                ...(isActive ? styles.activeLink : {})
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              <span>{label}</span>
              {isActive && <div style={styles.activeBar} />}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerLine} />
        <span style={styles.version}>v0.1.0</span>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    width: 'var(--sidebar-width)',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 20px 24px',
    borderBottom: '1px solid var(--color-border)'
  },
  logoIcon: {
    fontSize: 22
  },
  logoText: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.1
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.03em'
  },
  logoSub: {
    fontSize: 10,
    color: 'var(--color-primary)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.1em'
  },
  nav: {
    flex: 1,
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    transition: 'all 0.15s',
    position: 'relative',
    textDecoration: 'none'
  },
  activeLink: {
    color: 'var(--color-text)',
    background: 'var(--color-surface-hover)'
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 3,
    height: 16,
    borderRadius: '0 3px 3px 0',
    backgroundColor: 'var(--color-primary)'
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid var(--color-border)'
  },
  footerLine: {
    width: 24,
    height: 2,
    borderRadius: 1,
    background: 'var(--color-primary)',
    marginBottom: 8,
    opacity: 0.4
  },
  version: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    fontFamily: "'IBM Plex Mono', monospace"
  }
}
