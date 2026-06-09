import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createReconciliation } from '$lib/server/reconciliation'
import { parseMoney } from '$lib/money'

// Admin-only. Record a completed bank reconciliation. The statement balance
// arrives as a dollar string; createReconciliation re-validates that the cleared
// balance reconciles to it (and rejects already-cleared entries) → 400 on
// failure. No journal entries are mutated; the record references the cleared ids.
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  if (!body || !body.account_id || !Array.isArray(body.cleared_entry_ids)) {
    throw error(400, 'Expected { account_id, statement_date, statement_balance, cleared_entry_ids: [] }')
  }

  let statement_balance
  try {
    statement_balance = parseMoney(typeof body.statement_balance === 'number' ? body.statement_balance : String(body.statement_balance))
  } catch (e) {
    throw error(400, `Invalid statement balance: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const rec = await createReconciliation({
      account_id: String(body.account_id),
      statement_date: String(body.statement_date ?? '').trim(),
      statement_balance,
      cleared_entry_ids: body.cleared_entry_ids.map(String),
      created_by: (user.email as string) ?? (user.displayName as string),
    })
    return json(rec, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
