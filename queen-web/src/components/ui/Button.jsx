/**
 * Button — CRT Neural Interface Control
 *
 * Monospace, uppercase, sharp-edged buttons.
 * Supports primary / danger / ghost / outline variants, sm / md / lg sizes.
 * Loading state shows spinning Loader2. Icon slots preserved.
 */
import { Loader2 } from 'lucide-react'

const variants = {
  primary: {
    background: 'var(--color-primary)',
    color: '#0a0b0f',
    border: '1px solid var(--color-primary)',
    hoverBg: 'var(--color-primary-strong)',
    hoverBorder: 'var(--color-primary-strong)',
    hoverBoxShadow: '0 0 10px var(--color-primary-glow)',
  },
  danger: {
    background: 'transparent',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error-dim)',
    hoverBg: 'var(--color-error-dim)',
    hoverBorder: 'var(--color-error)',
    hoverBoxShadow: '0 0 8px rgba(255, 45, 85, 0.15)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    border: '1px solid transparent',
    hoverBg: 'var(--color-surface-hover)',
    hoverBorder: 'transparent',
    hoverBoxShadow: 'none',
  },
  outline: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    hoverBg: 'var(--color-surface-hover)',
    hoverBorder: 'var(--color-border-hover)',
    hoverBoxShadow: 'none',
  },
}

const sizes = {
  sm: { padding: '4px 10px', fontSize: 11, gap: 5, iconSize: 12 },
  md: { padding: '6px 14px', fontSize: 12, gap: 6, iconSize: 14 },
  lg: { padding: '8px 18px', fontSize: 13, gap: 7, iconSize: 15 },
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
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1,
        borderRadius: '2px',
        background: v.background,
        color: v.color,
        border: v.border,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background var(--duration-fast) var(--ease-default), border-color var(--duration-fast) var(--ease-default), box-shadow var(--duration-fast) var(--ease-default)',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = v.hoverBg
          e.currentTarget.style.borderColor = v.hoverBorder
          e.currentTarget.style.boxShadow = v.hoverBoxShadow
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = v.background
        e.currentTarget.style.borderColor = v.border.replace(/^1px solid /, '')
        e.currentTarget.style.boxShadow = 'none'
      }}
      {...rest}
    >
      {loading ? (
        <Loader2 size={s.iconSize} style={{ animation: 'spin 1s linear infinite' }} />
      ) : Icon ? (
        <Icon size={s.iconSize} />
      ) : null}
      {children}
      {IconRight && !loading && <IconRight size={s.iconSize} />}
    </button>
  )
}
