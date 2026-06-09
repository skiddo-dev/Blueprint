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
