/**
 * StatCard — unified stats card (CRT neural interface style)
 *
 * Supports icon (JSX or component), value, label, sub, active highlight, click filter.
 * Bebas Neue for large value numbers, JetBrains Mono for label/sub.
 * Sharp corners, 2px left accent border when active.
 */
import { useRef, useCallback, isValidElement, createElement } from 'react'

export function StatCard({
  icon,
  label,
  value,
  sub,
  accentColor = 'var(--color-primary)',
  active = false,
  onClick,
  size = 'default',
  style,
}) {
  const ref = useRef(null)
  const isCompact = size === 'compact'

  const handleEnter = useCallback(() => {
    if (ref.current) {
      ref.current.style.borderColor = accentColor
      ref.current.style.boxShadow = `0 0 12px ${accentColor}12`
    }
  }, [accentColor])

  const handleLeave = useCallback(() => {
    if (ref.current && !active) {
      ref.current.style.borderColor = 'var(--color-border)'
      ref.current.style.boxShadow = 'none'
    }
  }, [accentColor, active])

  const iconEl = isValidElement(icon)
    ? icon
    : icon
      ? createElement(icon, { size: isCompact ? 14 : 16 })
      : null

  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: isCompact ? 'row' : 'column',
        alignItems: isCompact ? 'center' : 'flex-start',
        gap: isCompact ? 8 : 10,
        padding: isCompact ? '10px 14px' : 16,
        background: active
          ? `color-mix(in srgb, ${accentColor} 6%, var(--color-surface))`
          : 'var(--color-surface)',
        border: `1px solid ${active ? accentColor : 'var(--color-border)'}`,
        borderLeft: active ? `2px solid ${accentColor}` : `1px solid ${active ? accentColor : 'var(--color-border)'}`,
        borderRadius: '3px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all var(--duration-fast) var(--ease-default)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {iconEl && (
        <div style={{
          color: accentColor,
          opacity: 0.8,
          flexShrink: 0,
        }}>
          {iconEl}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{
          fontSize: isCompact ? 22 : 28,
          fontWeight: 400,
          fontFamily: "'Bebas Neue', sans-serif",
          color: 'var(--color-text)',
          letterSpacing: '0.02em',
          lineHeight: 1.1,
        }}>
          {value ?? '\u2014'}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          fontWeight: 500,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.02em',
        }}>
          {label}
        </span>
        {sub && (
          <span style={{
            fontSize: 10,
            color: accentColor,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
          }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}
