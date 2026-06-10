import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { convertToBill } from '$lib/server/purchaseOrders'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { parseMoney, cents, type Cents } from '$lib/money'
import type { BillLine } from '$lib/accounting/types'

// Admin-only. Convert (part of) a PO into a posted bill. Lines are optional —
// default is the unbilled remainder.
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null) ?? {}
  let lines: BillLine[] | undefined
  if (Array.isArray(body.lines)) {
    try {
      lines = body.lines.map((l: Record<string, unknown>) => ({
        account_id: String(l.account_id ?? '').trim(),
        description: String(l.description ?? '').trim(),
        amount: (l.amount === undefined || l.amount === '' ? cents(0) : parseMoney(typeof l.amount === 'number' ? l.amount : String(l.amount))) as Cents,
      })).filter((l: BillLine) => l.amount > 0)
    } catch (e) {
      throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  try {
    const bill = await convertToBill(params.id, {
      bill_date: String(body.bill_date ?? new Date().toISOString().slice(0, 10)).trim(),
      ...(lines?.length ? { lines } : {}),
      ...(body.net_days !== undefined ? { net_days: Number(body.net_days) } : {}),
      ...(body.vendor_invoice_no ? { vendor_invoice_no: String(body.vendor_invoice_no) } : {}),
      created_by: actorOf(user),
    })
    return json(bill, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
