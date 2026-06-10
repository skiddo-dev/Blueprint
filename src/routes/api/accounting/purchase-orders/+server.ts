import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createPO } from '$lib/server/purchaseOrders'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { parseMoney, cents, type Cents } from '$lib/money'
import type { BillLine } from '$lib/accounting/types'

// Admin-only. Create a purchase order (non-posting — nothing hits the ledger
// until it's converted to a bill). Amounts arrive as dollar strings.
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !body.vendor_name || !Array.isArray(body.lines)) {
    throw error(400, 'Expected { vendor_name, date, lines: [{ account_id, description, amount }] }')
  }
  let lines: BillLine[]
  try {
    lines = body.lines.map((l: Record<string, unknown>) => ({
      account_id: String(l.account_id ?? '').trim(),
      description: String(l.description ?? '').trim(),
      amount: (l.amount === undefined || l.amount === '' ? cents(0) : parseMoney(typeof l.amount === 'number' ? l.amount : String(l.amount))) as Cents,
    }))
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    const po = await createPO({
      vendor_name: String(body.vendor_name),
      vendor_email: body.vendor_email ? String(body.vendor_email) : undefined,
      date: String(body.date ?? new Date().toISOString().slice(0, 10)).trim(),
      expected_date: body.expected_date ? String(body.expected_date) : undefined,
      lines,
      job: body.job ? String(body.job) : undefined,
      memo: body.memo ? String(body.memo) : undefined,
      created_by: actorOf(user),
    })
    return json(po, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
