/**
 * PageHeader — 页面标题区
 *
 * 统一的页面标题 + 计数 badge + 右侧操作区。
 * 使用 Syne 显示字体，带渐变分隔线。
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
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'Syne', 'DM Sans', sans-serif",
          color: 'var(--color-text)',
          letterSpacing: '-0.04em',
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
 * SectionHeader — 区域标题
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
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontFamily: "'IBM Plex Mono', monospace",
        whiteSpace: 'nowrap',
      }}>
        {title}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'linear-gradient(90deg, var(--color-border), transparent)',
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
