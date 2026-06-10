// Pure recurrence logic — no database. The server engine claims a due template
// and asks this module for the next occurrence date; keeping the date math
// pure makes month-end clamping unit-testable.

export type RecurrenceCadence = { unit: 'week' | 'month'; interval: number }

/** The next occurrence after `dateISO`. Month steps clamp to the last day of a
 *  shorter month (Jan 31 → Feb 28 → Mar 28 …, matching how rent/retainers are
 *  billed), week steps are exact 7-day multiples. */
export function advanceDate(dateISO: string, cadence: RecurrenceCadence): string {
  const interval = Math.max(1, Math.floor(cadence.interval))
  const d = new Date(`${dateISO}T00:00:00Z`)
  if (cadence.unit === 'week') {
    d.setUTCDate(d.getUTCDate() + 7 * interval)
    return d.toISOString().slice(0, 10)
  }
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + interval, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

/** "every month" / "every 2 weeks" — for the manage page. */
export function describeCadence(c: RecurrenceCadence): string {
  const n = Math.max(1, Math.floor(c.interval))
  return n === 1 ? `every ${c.unit}` : `every ${n} ${c.unit}s`
}
