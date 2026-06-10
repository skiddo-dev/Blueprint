import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createDeposit } from '$lib/server/deposits'
import { requireAdmin, actorOf } from '$lib/server/authz'

// Admin-only. Group undeposited payments into one posted bank deposit.
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !body.account_id || !Array.isArray(body.payment_ids)) {
    throw error(400, 'Expected { account_id, date, payment_ids: [...] }')
  }
  try {
    const dep = await createDeposit({
      account_id: String(body.account_id),
      date: String(body.date ?? new Date().toISOString().slice(0, 10)).trim(),
      payment_ids: body.payment_ids.map(String),
      ...(body.memo ? { memo: String(body.memo) } : {}),
      created_by: actorOf(user),
    })
    return json(dep, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
