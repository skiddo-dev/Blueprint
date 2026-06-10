// Pure purchase-order logic — no database. POs are NON-POSTING documents: a
// commitment to spend, not a liability. Nothing hits the ledger until a PO is
// converted to a bill (which posts normally). "Billed so far" is therefore
// DERIVED from the non-void bills linked by po_id — never decremented or
// stored — so partial billing, bill voids, and crashes can't desync anything.
import { type Cents, cents, sum } from '$lib/money'
import type { BillLine } from './types'

export interface PurchaseOrder {
  _id: string
  number: number          // per-year sequence (counters _id `po:<year>`)
  year: number
  vendor_id: string
  vendor_name: string
  date: string            // ISO YYYY-MM-DD
  expected_date?: string  // when the goods/work are expected
  lines: BillLine[]       // same shape bills use — account_id per line
  total: Cents
  status: 'open' | 'partially-billed' | 'closed' | 'cancelled' // derived except manual close/cancel
  manually_closed?: boolean
  cancelled?: boolean
  job?: string
  memo?: string
  created_by?: string
  created_at: string
  updated_at?: string
}

export function poTotal(lines: { amount: Cents }[]): Cents {
  return sum(lines.map((l) => l.amount))
}

/** Status from the derived billed amount. Manual close/cancel override; billing
 *  ≥ the total closes it automatically (over-billing happens — status caps). */
export function poStatus(
  total: Cents,
  billed: Cents,
  opts: { manuallyClosed?: boolean; cancelled?: boolean } = {},
): PurchaseOrder['status'] {
  if (opts.cancelled) return 'cancelled'
  if (opts.manuallyClosed || billed >= total) return 'closed'
  if (billed > 0) return 'partially-billed'
  return 'open'
}

/** Prefill lines for "convert the remainder to a bill": each line scaled by the
 *  overall remaining fraction (penny-safe per line; simple and predictable —
 *  the user edits the draft anyway). Empty when nothing remains. */
export function remainingLines(lines: BillLine[], total: Cents, billed: Cents): BillLine[] {
  const remaining = total - billed
  if (remaining <= 0) return []
  if (billed === 0) return lines
  const scale = remaining / total
  const out = lines
    .map((l) => ({ ...l, amount: cents(Math.round(l.amount * scale)) }))
    .filter((l) => l.amount > 0)
  // Pin the rounding drift onto the largest line so the draft sums exactly.
  const drift = remaining - out.reduce((s, l) => s + l.amount, 0)
  if (drift !== 0 && out.length) {
    const biggest = out.reduce((a, b) => (b.amount > a.amount ? b : a))
    biggest.amount = cents(biggest.amount + drift)
  }
  return out
}

export const poNumber = (po: Pick<PurchaseOrder, 'year' | 'number'>): string =>
  `PO-${po.year}-${String(po.number).padStart(4, '0')}`
