import { useState, useCallback } from 'react'

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
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        borderRadius: 2,
        outline: 'none',
        marginLeft: 4,
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
      }}
    >
      <div style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 2,
        background: 'var(--color-toggle-track)',
        padding: 2,
        overflow: 'hidden',
        transition: 'background 0.3s ease',
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* Dark mode indicator: cyan dot on left */}
        <span style={{
          position: 'absolute',
          left: 5,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: 4,
          borderRadius: 0,
          backgroundColor: 'var(--color-primary)',
          boxShadow: isDark ? '0 0 6px var(--color-primary-glow)' : 'none',
          opacity: isDark ? 1 : 0.3,
          transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
        }} />

        {/* Light mode indicator: warm dot on right */}
        <span style={{
          position: 'absolute',
          right: 5,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: 4,
          borderRadius: 0,
          backgroundColor: '#f59e0b',
          boxShadow: isDark ? 'none' : '0 0 6px rgba(245, 158, 11, 0.5)',
          opacity: isDark ? 0.3 : 1,
          transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
        }} />

        {/* Knob */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          width: 12,
          height: 12,
          borderRadius: 2,
          background: 'var(--color-toggle-knob)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isDark ? 'translateX(0)' : 'translateX(16px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </button>
  )
}
