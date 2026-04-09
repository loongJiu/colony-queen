/**
 * Button — 统一按钮组件
 *
 * 支持 primary / danger / ghost / outline 变体，sm / md / lg 尺寸。
 * 带 loading 旋转图标和 icon 插槽。
 */
import { Loader2 } from 'lucide-react'

const variants = {
  primary: {
    background: 'var(--color-primary)',
    color: '#0a0b0f',
    border: '1px solid var(--color-primary)',
    hoverBg: 'var(--color-primary-strong)',
  },
  danger: {
    background: 'transparent',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error-dim)',
    hoverBg: 'var(--color-error-dim)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid transparent',
    hoverBg: 'var(--color-surface-hover)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    hoverBg: 'var(--color-surface-hover)',
  },
}

const sizes = {
  sm: { padding: '6px 12px', fontSize: 12, gap: 5, iconSize: 13 },
  md: { padding: '8px 16px', fontSize: 13, gap: 7, iconSize: 15 },
  lg: { padding: '10px 20px', fontSize: 14, gap: 8, iconSize: 16 },
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  onClick,
  children,
  style,
  ...rest
}) {
  const v = variants[variant] || variants.ghost
  const s = sizes[size] || sizes.md

  return (
    <button
      onClick={disabled || loading ? undefined : onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1,
        borderRadius: 'var(--radius-sm)',
        background: v.background,
        color: v.color,
        border: v.border,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: `all var(--duration-fast) var(--ease-default)`,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) e.currentTarget.style.background = v.hoverBg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = v.background
      }}
      {...rest}
    >
      {loading ? <Loader2 size={s.iconSize} style={{ animation: 'spin 1s linear infinite' }} /> : Icon ? <Icon size={s.iconSize} /> : null}
      {children}
      {IconRight && !loading && <IconRight size={s.iconSize} />}
    </button>
  )
}
