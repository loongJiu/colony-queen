/**
 * PageHeader — page title area (CRT neural interface style)
 *
 * Unified page title + count badge + right-side actions area.
 * Uses Space Grotesk display font, sharp design.
 */
import { Badge } from './Badge'

export function PageHeader({ title, count, actions, style }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 4,
      animation: 'fadeIn 0.3s var(--ease-out) backwards',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          color: 'var(--color-text)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          margin: 0,
        }}>
          {title}
        </h1>
        {count != null && (
          <Badge variant="count" color="var(--color-primary)">
            {count}
          </Badge>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  )
}

/**
 * SectionHeader — section title (CRT neural interface style)
 *
 * JetBrains Mono, 10px uppercase, solid divider line.
 */
export function SectionHeader({ title, sub, style }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 12,
      marginBottom: 8,
      ...style,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontFamily: "'JetBrains Mono', monospace",
        whiteSpace: 'nowrap',
      }}>
        {title}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'var(--color-border)',
      }} />
      {sub && (
        <span style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
        }}>
          {sub}
        </span>
      )}
    </div>
  )
}
