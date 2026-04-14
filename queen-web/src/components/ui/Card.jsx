/**
 * Card — CRT Neural Interface Panel
 *
 * Sharp-edged container with hard-border hover reveal and cyan glow.
 * Props API unchanged: hoverable, borderColor, padding, onClick, style, className.
 */
import { useRef, useCallback } from 'react'

export function Card({
  children,
  hoverable = false,
  borderColor,
  padding = 'md',
  onClick,
  style,
  className,
  ...rest
}) {
  const ref = useRef(null)

  const paddings = { sm: 10, md: 14, lg: 20 }

  const baseBorder = borderColor || 'var(--color-border)'

  const handleEnter = useCallback(() => {
    if (!hoverable || !ref.current) return
    ref.current.style.borderColor = borderColor || 'var(--color-primary)'
    ref.current.style.boxShadow = '0 0 12px var(--color-primary-glow), inset 0 0 8px var(--color-primary-dim)'
  }, [hoverable, borderColor])

  const handleLeave = useCallback(() => {
    if (!ref.current) return
    ref.current.style.borderColor = baseBorder
    ref.current.style.boxShadow = 'none'
  }, [baseBorder])

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${baseBorder}`,
        borderRadius: 'var(--radius-sm)',
        padding: paddings[padding],
        transition: 'border-color var(--duration-fast) var(--ease-default), box-shadow var(--duration-fast) var(--ease-default)',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      {...rest}
    >
      {children}
    </div>
  )
}
