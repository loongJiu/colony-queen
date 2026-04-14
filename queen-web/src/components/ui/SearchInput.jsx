/**
 * SearchInput — CRT terminal search field
 */
import { Search } from 'lucide-react'

export function SearchInput({ value, onChange, placeholder = 'Search...', style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <style>{`
        .crt-search-input {
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
        }
        .crt-search-input:focus {
          border-color: var(--color-primary) !important;
          box-shadow: 0 0 8px var(--color-primary-glow), inset 0 0 4px var(--color-primary-glow) !important;
        }
      `}</style>
      <Search size={13} style={{
        position: 'absolute',
        left: 9,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)',
        pointerEvents: 'none',
        zIndex: 1,
      }} />
      <input
        type="text"
        className="crt-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '6px 10px 6px 30px',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          letterSpacing: '0.02em',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--color-primary)'
          e.target.style.boxShadow = '0 0 8px var(--color-primary-glow), inset 0 0 4px var(--color-primary-glow)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--color-border)'
          e.target.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}
