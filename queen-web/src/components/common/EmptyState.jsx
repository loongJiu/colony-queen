import { Inbox } from 'lucide-react'

export function EmptyState ({ icon: Icon = Inbox, title, description }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      gap: 12,
      color: 'var(--color-text-muted)'
    }}
    >
      <Icon size={32} strokeWidth={1.5} style={{ opacity: 0.5 }} />
      {title && <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>}
      {description && <div style={{ fontSize: 13, opacity: 0.7 }}>{description}</div>}
    </div>
  )
}
