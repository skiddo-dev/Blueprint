// Client-safe display helpers for the accounting UI. Money in the books is an
// integer count of cents (see $lib/money), but it crosses the load boundary into
// pages as a plain `number` — so these take `number`, not the `Cents` brand.
// This is the single source of truth for the 16 pages that used to each declare
// their own `const usd = …`. The server-side, brand-checked equivalent is
// `format()` in $lib/money.

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Cents (plain number) → "$1,234.56". Null/NaN-safe so a missing field renders $0.00. */
export function usd(cents: number): string {
  return USD.format((Number.isFinite(cents) ? cents : 0) / 100)
}

const USD_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
})

/** Cents → a short axis-friendly figure: "$70K", "$1.2M", "$450". */
export function usdCompact(cents: number): string {
  return USD_COMPACT.format((Number.isFinite(cents) ? cents : 0) / 100)
}

/** A ratio (e.g. 0.184) → "18%" / "18.4%". For margins on KPI tiles. */
export function pct(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

/** First/last day of the current month and year as ISO `YYYY-MM-DD`, for
 *  seeding report ranges and the hub's MTD/YTD net-income windows. */
export function monthRange(today = new Date()): { from: string; to: string } {
  const y = today.getFullYear()
  const m = today.getMonth()
  const first = new Date(Date.UTC(y, m, 1))
  const last = new Date(Date.UTC(y, m + 1, 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

export function yearRange(today = new Date()): { from: string; to: string } {
  const y = today.getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/** The day before an ISO date — the opening-balance cutoff for windowed
 *  registers (shared by the register page and its CSV export). */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** A due date as people read it — "12d overdue", "Due today", "Due in 30d" —
 *  so the working lists carry urgency instead of raw ISO dates. */
export function relativeDue(dueISO: string, todayISO: string): { label: string; overdue: boolean } {
  const days = Math.floor((Date.parse(`${dueISO}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86_400_000)
  if (Number.isNaN(days)) return { label: dueISO, overdue: false }
  if (days < 0) return { label: `${-days}d overdue`, overdue: true }
  if (days === 0) return { label: 'Due today', overdue: false }
  if (days === 1) return { label: 'Due tomorrow', overdue: false }
  return { label: `Due in ${days}d`, overdue: false }
}
