/**
 * SearchInput — 搜索输入框
 */
import { Search } from 'lucide-react'

export function SearchInput({ value, onChange, placeholder = 'Search...', style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <Search size={14} style={{
        position: 'absolute',
        left: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)',
        pointerEvents: 'none',
      }} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '7px 10px 7px 32px',
          fontSize: 12,
          fontFamily: "'DM Sans', sans-serif",
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
          transition: `border-color var(--duration-fast) var(--ease-default)`,
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)' }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)' }}
      />
    </div>
  )
}
