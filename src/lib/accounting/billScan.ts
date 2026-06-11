// Pure side of bill-scan ingestion — no database, no LLM. The model reads a
// vendor invoice (PDF/photo) into a ScannedBill draft; everything here is the
// deterministic frame: matching the scan against open purchase orders and
// shaping the prefill. Nothing posts until the user reviews the draft and
// submits the normal bill form.
import type { Cents } from '$lib/money'
import { poNumber, type PurchaseOrder } from './purchaseOrders'

/** What the model extracts from a vendor invoice. Amounts stay strings exactly
 *  as written ("$1,234.56") — parseMoney converts at the endpoint boundary,
 *  the same contract the receipt scan uses. */
export interface ScannedBill {
  vendor: string | null
  vendor_invoice_no: string | null
  bill_date: string | null // ISO YYYY-MM-DD when clearly printed
  po: string | null        // a PO reference printed on the invoice, if any
  total: string | null
  memo: string             // ≤160 chars, what the bill is for
  lines: { description: string; amount: string | null; account_id: string | null }[]
  confidence: number
}

export type OpenPo = Pick<PurchaseOrder, '_id' | 'number' | 'year' | 'vendor_name' | 'total' | 'status'> & {
  billed: Cents
}

export interface PoMatch {
  po_id: string
  label: string      // "PO-2026-0003"
  vendor_name: string
  remaining: Cents
  reason: 'po-number' | 'vendor-amount' | 'vendor'
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Digits-only token for PO comparisons: "PO-2026-0003" → its number parts. */
function poDigits(ref: string): string[] {
  return (ref.match(/\d+/g) ?? []).map((d) => String(Number(d))) // strip leading zeros
}

function vendorsOverlap(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

/** Suggest the open PO a scanned bill most likely fulfills. Precedence:
 *  an explicit PO reference printed on the invoice beats everything; then a
 *  vendor match whose remaining balance fits the scanned total (±1%); then a
 *  vendor match only when it's unambiguous (exactly one open PO for them).
 *  Returns null rather than a shaky guess — a wrong link costs more than no
 *  link. */
export function suggestPoMatch(
  pos: OpenPo[],
  scan: { vendor: string | null; po: string | null; totalCents: Cents | null },
): PoMatch | null {
  const open = pos.filter((p) => p.status === 'open' || p.status === 'partially-billed')
  if (!open.length) return null

  const match = (p: OpenPo, reason: PoMatch['reason']): PoMatch => ({
    po_id: p._id,
    label: poNumber(p),
    vendor_name: p.vendor_name,
    remaining: (p.total - p.billed) as Cents,
    reason,
  })

  // 1) The invoice names a PO: match its digits against ours (number alone, or
  //    year+number) — vendors rarely transcribe our exact formatting.
  if (scan.po) {
    const refDigits = poDigits(scan.po)
    const byNumber = open.filter((p) => {
      const num = String(p.number)
      const yr = String(p.year)
      return refDigits.includes(num) || refDigits.join('-') === `${yr}-${num}`
    })
    if (byNumber.length === 1) return match(byNumber[0], 'po-number')
    if (byNumber.length > 1 && scan.vendor) {
      const alsoVendor = byNumber.filter((p) => vendorsOverlap(p.vendor_name, scan.vendor as string))
      if (alsoVendor.length === 1) return match(alsoVendor[0], 'po-number')
    }
  }

  if (!scan.vendor) return null
  const byVendor = open.filter((p) => vendorsOverlap(p.vendor_name, scan.vendor as string))
  if (!byVendor.length) return null

  // 2) Vendor + the scanned total fits what's left on the PO (±1%).
  if (scan.totalCents && scan.totalCents > 0) {
    const fits = byVendor.filter((p) => {
      const remaining = p.total - p.billed
      return remaining > 0 && Math.abs(remaining - (scan.totalCents as number)) <= Math.max(remaining, scan.totalCents as number) * 0.01
    })
    if (fits.length === 1) return match(fits[0], 'vendor-amount')
  }

  // 3) Vendor only — but never guess between several open POs.
  if (byVendor.length === 1) return match(byVendor[0], 'vendor')
  return null
}
