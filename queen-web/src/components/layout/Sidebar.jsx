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
      {/* Neural pulse line — data channel visualization */}
      <div style={s.pulseLine}>
        <div style={s.pulseDot} />
      </div>

      {/* Logo — cybernetic hive identity */}
      <div style={s.logo}>
        <div style={s.logoHex}>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <polygon
              points="14,1 26,8 26,20 14,27 2,20 2,8"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1"
              opacity="0.6"
            />
            <polygon
              points="14,5 22,10 22,18 14,23 6,18 6,10"
              fill="var(--color-primary-dim)"
              stroke="var(--color-primary)"
              strokeWidth="0.5"
              opacity="0.8"
            />
            <circle cx="14" cy="14" r="3" fill="var(--color-primary)" opacity="0.9" />
          </svg>
        </div>
        <div style={s.logoText}>
          <span style={s.logoTitle}>COLONY</span>
          <span style={s.logoSub}>NEURAL CTRL</span>
        </div>
      </div>

      {/* Navigation — neural pathways */}
      <nav style={s.nav}>
        <div style={s.navLabel}>MODULES</div>
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to ||
            (to !== '/' && location.pathname.startsWith(to))
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
                  e.currentTarget.style.color = 'var(--color-text)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-muted)'
                }
              }}
            >
              <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
              <span>{label}</span>
              {isActive && <div style={s.activeIndicator} />}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer — version + status */}
      <div style={s.footer}>
        <div style={s.footerDivider} />
        <div style={s.footerRow}>
          <span style={s.version}>SYS v1.0.0</span>
          <span style={s.footerDot} />
        </div>
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
    zIndex: 100,
    overflow: 'hidden',
  },

  /* Neural pulse line on the far left edge */
  pulseLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    background: 'linear-gradient(180deg, transparent, var(--color-primary-dim), var(--color-primary-glow), var(--color-primary-dim), transparent)',
    backgroundSize: '100% 200%',
    animation: 'neuralPulse 4s ease-in-out infinite',
  },
  pulseDot: {
    position: 'absolute',
    left: -1,
    width: 4,
    height: 20,
    borderRadius: 2,
    background: 'var(--color-primary)',
    boxShadow: '0 0 8px var(--color-primary-glow)',
    animation: 'pulseDot 3s ease-in-out infinite',
    top: '50%',
  },

  /* Logo */
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    borderBottom: '1px solid var(--color-border)',
  },
  logoHex: {
    flexShrink: 0,
    filter: 'drop-shadow(0 0 4px var(--color-primary-glow))',
  },
  logoText: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.1,
  },
  logoTitle: {
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    letterSpacing: '0.12em',
    color: 'var(--color-text)',
  },
  logoSub: {
    fontSize: 8,
    color: 'var(--color-primary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    marginTop: 1,
  },

  /* Navigation */
  nav: {
    flex: 1,
    padding: '16px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  navLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    padding: '0 8px 8px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    transition: 'all var(--duration-fast) var(--ease-default)',
    position: 'relative',
    textDecoration: 'none',
    fontFamily: "'Space Grotesk', sans-serif",
  },
  activeLink: {
    color: 'var(--color-primary)',
    background: 'var(--color-sidebar-active)',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 2,
    height: 14,
    backgroundColor: 'var(--color-primary)',
    boxShadow: '0 0 6px var(--color-primary-glow)',
  },

  /* Footer */
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid var(--color-border)',
  },
  footerDivider: {
    width: 16,
    height: 1,
    background: 'var(--color-border)',
    marginBottom: 8,
  },
  footerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  version: {
    fontSize: 9,
    color: 'var(--color-text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.05em',
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'var(--color-primary)',
    opacity: 0.4,
    boxShadow: '0 0 4px var(--color-primary-glow)',
  },
}
