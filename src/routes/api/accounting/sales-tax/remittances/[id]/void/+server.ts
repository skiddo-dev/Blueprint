import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { voidRemittance } from '$lib/server/salesTax'
import { requireAdmin, actorOf } from '$lib/server/authz'

// Admin-only. Void a remittance — posts a reversal dated today (same correction
// convention as invoice/bill voids, so period locks never block it).
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = await requireAdmin(locals)
  try {
    return json(await voidRemittance(params.id, { created_by: actorOf(user) }))
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
