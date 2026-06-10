import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getCloseThrough, setCloseThrough } from '$lib/server/accounting'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { writeAudit } from '$lib/server/audit'

// Admin-only. GET returns the current close-through date; POST sets it (or clears
// it with an empty value). Once set, postEntry rejects any entry dated on/before
// it — across manual entries, invoices, payments, and bills.
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals)
  return json({ closed_through: await getCloseThrough() })
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  const raw = body?.through
  const through = raw ? String(raw).trim() : ''
  if (through && !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
    throw error(400, 'through must be an ISO YYYY-MM-DD date (or empty to clear)')
  }
  await setCloseThrough(through || null)
  await writeAudit({
    actor: actorOf(user),
    action: through ? 'close.lock' : 'close.unlock',
    entity_type: 'close',
    entity_id: through || 'cleared',
    summary: through ? `Locked the period through ${through}` : 'Cleared the period lock',
  })
  return json({ closed_through: through || null })
}
