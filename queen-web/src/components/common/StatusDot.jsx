import { STATUS_COLORS } from '../../utils/constants'

const sizeMap = {
  sm: 6,
  md: 8,
  lg: 10
}

export function StatusDot ({ status, size = 'md', pulse = false }) {
  const color = STATUS_COLORS[status] || '#6b7280'
  const px = sizeMap[size] || 8

  return (
    <span
      style={{
        display: 'inline-block',
        width: px,
        height: px,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 ${px}px ${color}66`,
        flexShrink: 0,
        animation: pulse ? `dot-pulse-${status} 2s ease-in-out infinite` : undefined
      }}
    >
      {pulse && (
        <style>{`
          @keyframes dot-pulse-${status} {
            0%, 100% { opacity: 1; box-shadow: 0 0 ${px}px ${color}66; }
            50% { opacity: 0.6; box-shadow: 0 0 ${px * 2}px ${color}aa; }
          }
        `}</style>
      )}
    </span>
  )
}
