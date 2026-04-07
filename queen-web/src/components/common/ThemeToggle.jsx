import { useState, useCallback } from 'react'
import { Sun } from 'lucide-react'

const STORAGE_KEY = 'colony-theme'
const TRANSITION_CLASS = 'theme-transitioning'

function getInitialTheme () {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'dark'
  } catch {
    return 'dark'
  }
}

export function ThemeToggle () {
  const [theme, setTheme] = useState(getInitialTheme)
  const isDark = theme === 'dark'

  const toggle = useCallback(() => {
    const next = isDark ? 'light' : 'dark'

    document.documentElement.classList.add(TRANSITION_CLASS)
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* */ }

    setTimeout(() => {
      document.documentElement.classList.remove(TRANSITION_CLASS)
    }, 400)
  }, [isDark])

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      style={styles.trigger}
    >
      <div style={styles.track}>
        {/* Stars visible in dark mode */}
        <span style={{ ...styles.star, top: 4, right: 8, opacity: isDark ? 0.8 : 0 }} />
        <span style={{ ...styles.star, top: 14, right: 5, opacity: isDark ? 0.5 : 0 }} />
        <span style={{ ...styles.star, top: 8, right: 14, opacity: isDark ? 0.6 : 0 }} />
        <span style={{ ...styles.star, top: 16, right: 12, opacity: isDark ? 0.4 : 0 }} />

        {/* Knob — moon in dark, sun in light */}
        <div style={{
          ...styles.knob,
          transform: isDark ? 'translateX(0)' : 'translateX(22px)',
          background: isDark
            ? 'radial-gradient(circle at 35% 35%, #fde68a, #f59e0b)'
            : 'radial-gradient(circle at 50% 50%, #fef9c3, #fef3c7)',
          boxShadow: isDark
            ? '0 0 8px rgba(245, 158, 11, 0.5), inset 0 -2px 4px rgba(0,0,0,0.15)'
            : '0 1px 4px rgba(0,0,0,0.12)'
        }}
        >
          {isDark ? (
            <>
              <span style={{ ...styles.crater, top: 3, left: 4, width: 4, height: 4 }} />
              <span style={{ ...styles.crater, bottom: 4, right: 3, width: 3, height: 3 }} />
            </>
          ) : (
            <Sun size={12} strokeWidth={2.5} style={{ color: '#d97706' }} />
          )}
        </div>
      </div>
    </button>
  )
}

const styles = {
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    marginLeft: 4
  },
  track: {
    position: 'relative',
    width: 44,
    height: 22,
    borderRadius: 11,
    background: 'var(--color-toggle-track)',
    padding: 2,
    overflow: 'hidden',
    transition: 'background 0.3s ease'
  },
  knob: {
    position: 'relative',
    zIndex: 2,
    width: 18,
    height: 18,
    borderRadius: '50%',
    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease, box-shadow 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  star: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: '50%',
    background: '#e4e4e7',
    zIndex: 1,
    transition: 'opacity 0.4s ease'
  },
  crater: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'rgba(0, 0, 0, 0.12)'
  }
}
