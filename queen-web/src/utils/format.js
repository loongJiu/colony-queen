/**
 * 格式化时间距离（相对时间）
 */
export function formatTimeAgo (timestamp) {
  if (!timestamp) return '-'
  const diff = Date.now() - timestamp
  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/**
 * 格式化持续时间
 */
export function formatDuration (ms) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

/**
 * 格式化百分比
 */
export function formatPercent (value) {
  if (value == null) return '0%'
  return `${Math.round(value)}%`
}
