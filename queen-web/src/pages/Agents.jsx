import { Bot } from 'lucide-react'

export function Agents () {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '50vh',
      color: 'var(--color-text-muted)',
      flexDirection: 'column',
      gap: 8
    }}
    >
      <Bot size={32} strokeWidth={1.5} style={{ opacity: 0.4 }} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>Agents — Week 4</span>
      <span style={{ fontSize: 12, opacity: 0.6 }}>Agent management page coming in Week 4</span>
    </div>
  )
}
