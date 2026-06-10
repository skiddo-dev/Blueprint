import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { recordRemittance } from '$lib/server/salesTax'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { parseMoney } from '$lib/money'

// Admin-only. Record a sales-tax remittance: Dr Sales Tax Payable / Cr bank.
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !body.account_id || body.amount === undefined || body.amount === '') {
    throw error(400, 'Expected { date, amount, account_id, memo? }')
  }
  let amount
  try {
    amount = parseMoney(typeof body.amount === 'number' ? body.amount : String(body.amount))
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    const rem = await recordRemittance({
      date: String(body.date ?? new Date().toISOString().slice(0, 10)).trim(),
      amount,
      account_id: String(body.account_id),
      ...(body.memo ? { memo: String(body.memo) } : {}),
      created_by: actorOf(user),
    })
    return json(rem, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
