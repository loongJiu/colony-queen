/**
 * StatCard — 统一统计卡片
 *
 * 取代各页面重复定义的 StatCard。
 * 支持 icon（JSX 或组件）、value、label、sub、active 高亮、点击筛选。
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
      ref.current.style.boxShadow = `0 0 20px ${accentColor}15`
    }
  }, [accentColor])

  const handleLeave = useCallback(() => {
    if (ref.current && !active) {
      ref.current.style.borderColor = active ? accentColor : 'var(--color-border)'
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
        background: active ? `color-mix(in srgb, ${accentColor} 8%, var(--color-surface))` : 'var(--color-surface)',
        border: `1px solid ${active ? accentColor : 'var(--color-border)'}`,
        borderRadius: 'var(--radius)',
        cursor: onClick ? 'pointer' : 'default',
        transition: `all var(--duration-fast) var(--ease-default)`,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Accent glow */}
      <div style={{
        position: 'absolute',
        top: -20,
        right: -20,
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

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
          fontSize: isCompact ? 20 : 22,
          fontWeight: 700,
          fontFamily: "'Syne', 'DM Sans', sans-serif",
          color: 'var(--color-text)',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
        }}>
          {value ?? '—'}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          fontWeight: 500,
          letterSpacing: '0.01em',
        }}>
          {label}
        </span>
        {sub && (
          <span style={{
            fontSize: 10,
            color: accentColor,
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 500,
          }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}
