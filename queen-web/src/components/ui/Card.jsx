/**
 * Card — 通用卡片容器
 *
 * 统一的卡片样式，支持 hover 效果、自定义边框、多种内边距。
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

  const paddings = { sm: 12, md: 16, lg: 24 }

  const handleEnter = useCallback(() => {
    if (!hoverable || !ref.current) return
    ref.current.style.borderColor = borderColor || 'var(--color-border-hover)'
    ref.current.style.boxShadow = 'var(--shadow-md)'
    if (onClick) ref.current.style.transform = 'translateY(-1px)'
  }, [hoverable, borderColor, onClick])

  const handleLeave = useCallback(() => {
    if (!ref.current) return
    ref.current.style.borderColor = borderColor || 'var(--color-border)'
    ref.current.style.boxShadow = 'none'
    if (onClick) ref.current.style.transform = 'none'
  }, [borderColor, onClick])

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${borderColor || 'var(--color-border)'}`,
        borderRadius: 'var(--radius)',
        padding: paddings[padding],
        transition: `all var(--duration-fast) var(--ease-default)`,
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
