/**
 * A coarse "how long ago" — the same rough grain the battle clocks already
 * use (`20:00`, not `20:00.000`): nobody reading "synced 3 minutes ago" or
 * "played 2 days ago" needs it to the second.
 */
export function formatRelativeTime(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
