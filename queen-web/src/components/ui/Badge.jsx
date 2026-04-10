/**
 * Badge — unified tag component (CRT neural interface style)
 *
 * Supports status / count / tag / capability variants.
 * Auto-maps status colors and pulse animation.
 * Uses JetBrains Mono, uppercase for status/capability, sharp corners.
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
    : resolved + '18'

  const isCount = variant === 'count'
  const isStatus = variant === 'status'
  const isCapability = variant === 'capability'

  const fontSize = isCount ? 10 : 11
  const weight = isCapability ? 500 : 600
  const px = isCount ? 6 : 8
  const py = isCount ? 2 : 3
  const transform = (isStatus || isCapability) ? 'uppercase' : 'none'
  const tracking = (isStatus || isCapability) ? '0.06em' : '0'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: `${py}px ${px}px`,
        fontSize,
        fontWeight: weight,
        fontFamily: "'JetBrains Mono', monospace",
        color: resolved,
        background: dimColor,
        borderRadius: isCount ? '4px' : '2px',
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
