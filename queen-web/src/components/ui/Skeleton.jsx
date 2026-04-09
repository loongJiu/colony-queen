/**
 * Skeleton — 骨架屏加载占位
 */
export function Skeleton({ variant = 'rect', width, height, count = 1, style }) {
  const isCircle = variant === 'circle'
  const isText = variant === 'text'

  const el = (
    <div style={{
      width: width || (isText ? '100%' : undefined),
      height: height || (isText ? 14 : undefined),
      borderRadius: isCircle ? '50%' : 'var(--radius-sm)',
      background: `linear-gradient(90deg, var(--color-skeleton-base) 25%, var(--color-skeleton-shine) 50%, var(--color-skeleton-base) 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
      ...style,
    }} />
  )

  if (count === 1) return el
  return Array.from({ length: count }, (_, i) => (
    <div key={i} style={{ marginBottom: i < count - 1 ? 8 : 0 }}>{el}</div>
  ))
}
