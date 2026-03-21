export function formatDate(date: string | null | undefined, format?: string): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDateTimeConversational(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'a few seconds ago'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return formatDate(date)
}
