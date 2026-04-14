import { STATUS_COLORS } from '../../utils/constants'

export function LoadBar ({ value = 0, status = 'idle' }) {
  const pct = Math.min(100, Math.max(0, value))
  const color =
    pct >= 90 ? STATUS_COLORS.error :
    pct >= 60 ? STATUS_COLORS.busy :
    STATUS_COLORS.success

  return (
    <div
      style={{
        width: '100%',
        height: 4,
        borderRadius: 0,
        backgroundColor: 'var(--color-load-track)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 0,
          backgroundColor: color,
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: `0 0 8px ${color}88, 0 0 3px ${color}cc`,
        }}
      />
    </div>
  )
}
