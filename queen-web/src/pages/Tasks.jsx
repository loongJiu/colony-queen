import { ListTodo } from 'lucide-react'

export function Tasks () {
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
      <ListTodo size={32} strokeWidth={1.5} style={{ opacity: 0.4 }} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>Tasks — Week 3</span>
      <span style={{ fontSize: 12, opacity: 0.6 }}>Task tracking page coming in Week 3</span>
    </div>
  )
}
