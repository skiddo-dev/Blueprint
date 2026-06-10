// Pure 1099 rollup — no database. Cash paid per 1099-flagged vendor in a
// calendar year, with the $600 IRS reporting threshold flagged. Scope: BILL
// PAYMENTS only — quick expenses carry a free-text payee, not a vendor link,
// so attributing them would be guesswork (the page says so; pay 1099 vendors
// through bills).
import { type Cents, cents } from '$lib/money'
import type { Bill, BillPayment, Vendor } from './types'

/** $600 — pay a 1099 vendor this much or more in a calendar year and a
 *  1099-NEC is due. */
export const TEN99_THRESHOLD = cents(60000)

export interface Ten99Row {
  vendor_id: string
  name: string
  tax_id?: string
  paymentCount: number
  total: Cents
  overThreshold: boolean
}

/** Payments to 1099 vendors in `year`, grouped per vendor, largest first. */
export function build1099Report(
  billPayments: BillPayment[],
  billsById: Map<string, Pick<Bill, 'vendor_id'>>,
  vendors: Vendor[],
  year: number,
): { rows: Ten99Row[]; total: Cents } {
  const flagged = new Map(vendors.filter((v) => v.is_1099).map((v) => [v._id, v]))
  const acc = new Map<string, { total: number; count: number }>()
  for (const p of billPayments) {
    if (Number(p.date.slice(0, 4)) !== year) continue
    const bill = billsById.get(p.bill_id)
    if (!bill || !flagged.has(bill.vendor_id)) continue
    const a = acc.get(bill.vendor_id) ?? { total: 0, count: 0 }
    a.total += p.amount
    a.count += 1
    acc.set(bill.vendor_id, a)
  }
  const rows: Ten99Row[] = [...acc.entries()]
    .map(([vendor_id, a]) => {
      const v = flagged.get(vendor_id)!
      return {
        vendor_id,
        name: v.name,
        ...(v.tax_id ? { tax_id: v.tax_id } : {}),
        paymentCount: a.count,
        total: cents(a.total),
        overThreshold: a.total >= TEN99_THRESHOLD,
      }
    })
    .sort((a, b) => b.total - a.total)
  return { rows, total: cents(rows.reduce((s, r) => s + r.total, 0)) }
}

/** "***-**-1234" — show enough of a tax id to confirm, never the whole thing. */
export function maskTaxId(taxId: string): string {
  const digits = taxId.replace(/\D/g, '')
  if (digits.length < 4) return '***'
  return `***-**-${digits.slice(-4)}`
}
