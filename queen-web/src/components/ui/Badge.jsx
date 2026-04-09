/**
 * Badge — 统一标签组件
 *
 * 支持 status / count / tag / capability 变体。
 * 自动映射状态颜色和脉冲动画。
 */
import { TASK_STATUS_COLORS, STATUS_COLORS } from '../../utils/constants'

const STATUS_MAP = {
  ...STATUS_COLORS,
  ...TASK_STATUS_COLORS,
}

export function Badge({
  variant = 'tag',
  color,
  status,
  pulse = false,
  children,
  style,
  ...rest
}) {
  const resolved = color || (status ? STATUS_MAP[status] : undefined) || 'var(--color-text-muted)'
  const dimColor = resolved.startsWith('var(')
    ? `color-mix(in srgb, ${resolved} 15%, transparent)`
    : resolved + '22'

  const fontSize = variant === 'count' ? 10 : 11
  const weight = variant === 'capability' ? 500 : 600
  const px = variant === 'count' ? 6 : 8
  const py = variant === 'count' ? 2 : 3
  const transform = variant === 'status' ? 'uppercase' : 'none'
  const tracking = variant === 'status' ? '0.04em' : '0'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: `${py}px ${px}px`,
        fontSize,
        fontWeight: weight,
        fontFamily: "'IBM Plex Mono', monospace",
        color: resolved,
        background: dimColor,
        borderRadius: variant === 'count' ? '10px' : 'var(--radius-sm)',
        textTransform: transform,
        letterSpacing: tracking,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        animation: pulse ? 'glowPulse 2s ease-in-out infinite' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
