import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { closePO, cancelPO } from '$lib/server/purchaseOrders'
import { requireAdmin, actorOf } from '$lib/server/authz'

// Admin-only. PATCH { action: 'close' | 'cancel' } — close stops further
// billing on a short-shipped PO; cancel is only allowed while nothing is
// billed against it.
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  const action = body?.action
  if (action !== 'close' && action !== 'cancel') throw error(400, "Expected { action: 'close' | 'cancel' }")
  try {
    if (action === 'close') await closePO(params.id, { created_by: actorOf(user) })
    else await cancelPO(params.id, { created_by: actorOf(user) })
    return json({ ok: true })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
