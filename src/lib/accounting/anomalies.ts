// Pure pre-close anomaly detection — no database, no LLM. Deterministic rules
// flag what a bookkeeper would catch scanning the month by eye: the same bill
// keyed in twice, a vendor bill far off that vendor's usual size, a quick
// expense entered twice. The month-end review page (and the AI narrative's
// fact payload) surface these; nothing here blocks posting — flags are advice,
// the human decides.
import type { Bill, JournalEntry } from './types'
import { usd } from './format'

export type AnomalyKind = 'duplicate-bill' | 'vendor-outlier' | 'duplicate-expense'

export interface Anomaly {
  kind: AnomalyKind
  severity: 'warn' | 'info'
  summary: string
  refs: { type: 'bill' | 'journal-entry'; id: string }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysApart(aISO: string, bISO: string): number {
  return Math.abs(Math.round((Date.parse(`${aISO}T00:00:00Z`) - Date.parse(`${bISO}T00:00:00Z`)) / DAY_MS))
}

function inMonth(dateISO: string, month: string): boolean {
  return dateISO.slice(0, 7) === month
}

const billRef = (b: Bill) => `#${b.year}-${b.number}`

/** Non-void bills with the same vendor and the same total, dated within
 *  `windowDays` of each other, at least one in the month under review. A pair
 *  whose vendor-invoice numbers BOTH exist and differ is skipped — two real
 *  invoices for the same amount happen (e.g. a monthly flat rate inside the
 *  window); matching numbers, or missing ones, stay flagged. */
export function findDuplicateBills(bills: Bill[], month: string, windowDays = 10): Anomaly[] {
  const live = bills.filter((b) => b.status !== 'void')
  const groups = new Map<string, Bill[]>()
  for (const b of live) {
    const key = `${b.vendor_id}|${b.total}`
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  const out: Anomaly[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => (a.bill_date < b.bill_date ? -1 : 1))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]
        const b = sorted[j]
        if (!inMonth(a.bill_date, month) && !inMonth(b.bill_date, month)) continue
        const gap = daysApart(a.bill_date, b.bill_date)
        if (gap > windowDays) continue
        if (a.vendor_invoice_no && b.vendor_invoice_no && a.vendor_invoice_no !== b.vendor_invoice_no) continue
        out.push({
          kind: 'duplicate-bill',
          severity: 'warn',
          summary:
            `Possible duplicate bill: ${billRef(a)} and ${billRef(b)} — ${a.vendor_name}, ` +
            `both ${usd(a.total)}, ${gap} day${gap === 1 ? '' : 's'} apart` +
            (a.vendor_invoice_no && a.vendor_invoice_no === b.vendor_invoice_no
              ? ` (same vendor invoice ${a.vendor_invoice_no})`
              : ''),
          refs: [
            { type: 'bill', id: a._id },
            { type: 'bill', id: b._id },
          ],
        })
      }
    }
  }
  return out
}

/** A bill in the month that is far above the vendor's track record: at least
 *  `minHistory` other non-void bills exist for the vendor, and this one is
 *  ≥ `factor`× their median AND at least `minDeltaCents` above it (so a $12
 *  bill tripling to $36 doesn't page anyone). Softer signal than a duplicate —
 *  big bills are often real — so severity is 'info'. */
export function findVendorOutliers(
  bills: Bill[],
  month: string,
  opts: { minHistory?: number; factor?: number; minDeltaCents?: number } = {},
): Anomaly[] {
  const { minHistory = 3, factor = 3, minDeltaCents = 50_000 } = opts
  const live = bills.filter((b) => b.status !== 'void')
  const byVendor = new Map<string, Bill[]>()
  for (const b of live) byVendor.set(b.vendor_id, [...(byVendor.get(b.vendor_id) ?? []), b])

  const out: Anomaly[] = []
  for (const vendorBills of byVendor.values()) {
    for (const b of vendorBills) {
      if (!inMonth(b.bill_date, month)) continue
      const others = vendorBills.filter((o) => o._id !== b._id)
      if (others.length < minHistory) continue
      const totals = others.map((o) => o.total).sort((x, y) => x - y)
      const mid = Math.floor(totals.length / 2)
      const median = totals.length % 2 ? totals[mid] : Math.round((totals[mid - 1] + totals[mid]) / 2)
      if (median <= 0) continue
      if (b.total >= median * factor && b.total - median >= minDeltaCents) {
        out.push({
          kind: 'vendor-outlier',
          severity: 'info',
          summary:
            `Bill ${billRef(b)} from ${b.vendor_name} is ${usd(b.total)} — ` +
            `well above their typical ${usd(median)} (${others.length} prior bills)`,
          refs: [{ type: 'bill', id: b._id }],
        })
      }
    }
  }
  return out
}

/** Quick expenses (source 'expense') with the same memo and the same amount,
 *  dated within `windowDays`, at least one in the month — the classic
 *  double-entry from "did I already key that receipt?". */
export function findDuplicateExpenses(entries: JournalEntry[], month: string, windowDays = 5): Anomaly[] {
  const expenses = entries.filter((e) => e.status === 'posted' && e.source === 'expense')
  const totalOf = (e: JournalEntry) => e.lines.reduce((s, l) => s + l.debit, 0)
  const groups = new Map<string, JournalEntry[]>()
  for (const e of expenses) {
    const key = `${(e.memo ?? '').trim().toLowerCase()}|${totalOf(e)}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const out: Anomaly[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : 1))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]
        const b = sorted[j]
        if (!inMonth(a.date, month) && !inMonth(b.date, month)) continue
        const gap = daysApart(a.date, b.date)
        if (gap > windowDays) continue
        out.push({
          kind: 'duplicate-expense',
          severity: 'warn',
          summary:
            `Possible double entry: two "${a.memo ?? '(no memo)'}" expenses of ${usd(totalOf(a))}, ` +
            `${gap} day${gap === 1 ? '' : 's'} apart`,
          refs: [
            { type: 'journal-entry', id: a._id },
            { type: 'journal-entry', id: b._id },
          ],
        })
      }
    }
  }
  return out
}

/** Every detector over one month, warnings first. The caller supplies the
 *  documents (this module never queries); `expenseEntries` should span the
 *  month padded by the duplicate window on both sides so edge pairs match. */
export function detectAnomalies(input: {
  bills: Bill[]
  expenseEntries: JournalEntry[]
  month: string
}): Anomaly[] {
  const all = [
    ...findDuplicateBills(input.bills, input.month),
    ...findVendorOutliers(input.bills, input.month),
    ...findDuplicateExpenses(input.expenseEntries, input.month),
  ]
  return all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
}
