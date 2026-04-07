import { STATUS_LABELS, STATUS_COLORS } from '../../utils/constants'
import { StatusDot } from '../common/StatusDot'

export function AgentBadge ({ status }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      color: STATUS_COLORS[status] || '#6b7280',
      fontFamily: "'IBM Plex Mono', monospace"
    }}
    >
      <StatusDot status={status} size='sm' />
      {STATUS_LABELS[status] || status}
    </span>
  )
}
