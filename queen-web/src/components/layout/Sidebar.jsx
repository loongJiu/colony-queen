import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, ListTodo, Users, FolderTree } from 'lucide-react'

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/agents', icon: Users, label: 'Agents' },
  { to: '/sessions', icon: FolderTree, label: 'Sessions' }
]

export function Sidebar () {
  const location = useLocation()

  return (
    <aside style={s.sidebar}>
      {/* Logo */}
      <div style={s.logo}>
        <span style={s.logoIcon}>&#x1F41D;</span>
        <div style={s.logoText}>
          <span style={s.logoTitle}>Colony</span>
          <span style={s.logoSub}>Queen</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={s.nav}>
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to
          return (
            <NavLink
              key={to}
              to={to}
              style={{
                ...s.link,
                ...(isActive ? s.activeLink : {})
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-sidebar-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              <span>{label}</span>
              {isActive && <div style={s.activeBar} />}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.footerLine} />
        <span style={s.version}>v1.0.0</span>
      </div>
    </aside>
  )
}

const s = {
  sidebar: {
    width: 'var(--sidebar-width)',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    background: 'var(--color-sidebar-bg)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 20px 10px',
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
    fontFamily: "'Syne', 'DM Sans', sans-serif",
    letterSpacing: '-0.03em',
    color: 'var(--color-text)'
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
    transition: 'all var(--duration-fast) var(--ease-default)',
    position: 'relative',
    textDecoration: 'none'
  },
  activeLink: {
    color: 'var(--color-text)',
    background: 'var(--color-sidebar-active)'
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
