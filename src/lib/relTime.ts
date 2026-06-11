/** Compact relative stamp for "last synced"-style labels: "just now", "4m ago",
 *  "2h ago", then a short date once it's a day or more old. Bad input → ''. */
export function relTime(iso: string | null | undefined, nowMs = Date.now()): string {
  const t = Date.parse(iso ?? '')
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((nowMs - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
