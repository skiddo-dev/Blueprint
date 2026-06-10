import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { disposeAsset, undisposeAsset } from '$lib/server/assets'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { parseMoney, cents } from '$lib/money'

// Admin-only. POST disposes ({ date, proceeds, cash_account_id? });
// DELETE undoes the disposal (reversal dated today).
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  try {
    const proceeds = body?.proceeds === undefined || body.proceeds === ''
      ? cents(0)
      : parseMoney(typeof body.proceeds === 'number' ? body.proceeds : String(body.proceeds))
    return json(await disposeAsset(params.id, {
      date: String(body?.date ?? new Date().toISOString().slice(0, 10)),
      proceeds,
      cash_account_id: body?.cash_account_id ? String(body.cash_account_id) : undefined,
      created_by: actorOf(user),
    }))
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = await requireAdmin(locals)
  try {
    return json(await undisposeAsset(params.id, { created_by: actorOf(user) }))
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
