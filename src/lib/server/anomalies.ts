// Server side of pre-close anomaly detection: load the month's documents (plus
// enough surrounding history for the duplicate windows and vendor baselines)
// and hand them to the pure detectors in $lib/accounting/anomalies.
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { detectAnomalies, type Anomaly } from '$lib/accounting/anomalies'
import type { Bill, JournalEntry } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

/** ISO date `days` away from the first/last day of "YYYY-MM". */
function monthEdge(month: string, edge: 'start' | 'end', padDays: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = edge === 'start' ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m, 0))
  d.setUTCDate(d.getUTCDate() + (edge === 'start' ? -padDays : padDays))
  return d.toISOString().slice(0, 10)
}

/** Anomalies for one "YYYY-MM" month. Bills load in full (vendor outliers need
 *  each vendor's history; the books are small and the query is bounded anyway);
 *  expense entries load only around the month, padded past the duplicate
 *  window so edge pairs still match. */
export async function getMonthAnomalies(month: string): Promise<Anomaly[]> {
  if (USE_MOCK) return []
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM')
  const d = await getDb()
  const [bills, expenseEntries] = await Promise.all([
    col('bills', d).find({}).sort({ bill_date: -1 }).limit(5000).toArray() as Promise<Bill[]>,
    col('journalEntries', d)
      .find({
        status: 'posted',
        source: 'expense',
        date: { $gte: monthEdge(month, 'start', 10), $lte: monthEdge(month, 'end', 10) },
      })
      .limit(2000)
      .toArray() as Promise<JournalEntry[]>,
  ])
  return detectAnomalies({
    bills: bills.map((b) => ({ ...b, _id: String(b._id) })),
    expenseEntries: expenseEntries.map((e) => ({ ...e, _id: String(e._id) })),
    month,
  })
}
