/**
 * FilterSelect — 筛选下拉
 */
import { ChevronDown } from 'lucide-react'

export function FilterSelect({ icon: Icon, value, onChange, options, style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      {Icon && <Icon size={13} style={{
        position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)', pointerEvents: 'none',
      }} />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          padding: Icon ? '7px 28px 7px 30px' : '7px 28px 7px 10px',
          fontSize: 12,
          fontFamily: "'DM Sans', sans-serif",
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
          cursor: 'pointer',
          transition: `border-color var(--duration-fast) var(--ease-default)`,
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)' }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)' }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={12} style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)', pointerEvents: 'none',
      }} />
    </div>
  )
}
