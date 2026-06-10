import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { voidDeposit } from '$lib/server/deposits'
import { requireAdmin, actorOf } from '$lib/server/authz'

// Admin-only. Void a deposit — reverses its entry (dated today) and returns the
// member payments to the undeposited pool. Blocked while reconciled.
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = await requireAdmin(locals)
  try {
    return json(await voidDeposit(params.id, { created_by: actorOf(user) }))
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
