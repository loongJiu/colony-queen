/**
 * FilterSelect — CRT terminal dropdown selector
 */
import { ChevronDown } from 'lucide-react'

export function FilterSelect({ icon: Icon, value, onChange, options, style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      {Icon && <Icon size={13} style={{
        position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)', pointerEvents: 'none', zIndex: 1,
      }} />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          padding: Icon ? '6px 28px 6px 28px' : '6px 28px 6px 10px',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          outline: 'none',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--color-primary)'
          e.target.style.boxShadow = '0 0 8px var(--color-primary-glow), inset 0 0 4px var(--color-primary-glow)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--color-border)'
          e.target.style.boxShadow = 'none'
        }}
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
