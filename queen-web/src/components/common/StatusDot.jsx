import { STATUS_COLORS } from '../../utils/constants'

const sizeMap = {
  sm: 5,
  md: 7,
  lg: 9
}

export function StatusDot ({ status, size = 'md', pulse = false }) {
  const color = STATUS_COLORS[status] || '#6b7280'
  const px = sizeMap[size] || 7
  const animName = `dot-blink-${status}-${px}`

  return (
    <>
      {pulse && (
        <style>{`
          @keyframes ${animName} {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.25; }
          }
        `}</style>
      )}
      <span
        style={{
          display: 'inline-block',
          width: px,
          height: px,
          borderRadius: pulse ? '50%' : 0,
          transform: pulse ? undefined : 'rotate(45deg)',
          backgroundColor: color,
          boxShadow: `0 0 ${px}px ${color}66`,
          flexShrink: 0,
          animation: pulse ? `${animName} 1.6s step-end infinite` : undefined,
        }}
      />
    </>
  )
}
