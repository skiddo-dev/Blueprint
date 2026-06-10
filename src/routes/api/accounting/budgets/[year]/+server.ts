import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getBudget, saveBudget } from '$lib/server/budgets'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { parseMoney } from '$lib/money'

// Admin-only. GET one year's budget; PUT replaces it whole (the grid saves as
// a unit). Amounts arrive as dollar strings per cell.
export const GET: RequestHandler = async ({ params, locals }) => {
  await requireAdmin(locals)
  const year = Number(params.year)
  if (!Number.isInteger(year)) throw error(400, 'Bad year')
  return json(await getBudget(year))
}

export const PUT: RequestHandler = async ({ request, params, locals }) => {
  const user = await requireAdmin(locals)
  const year = Number(params.year)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw error(400, 'Bad year')
  const body = await request.json().catch(() => null)
  if (!body || typeof body.amounts !== 'object') throw error(400, 'Expected { amounts: { account_id: ["0.00" × 12] } }')

  const amounts: Record<string, number[]> = {}
  try {
    for (const [id, arr] of Object.entries(body.amounts as Record<string, unknown[]>)) {
      if (!Array.isArray(arr)) throw new Error(`${id}: months must be an array`)
      const row = arr.map((v) => (v === '' || v === null || v === undefined ? 0 : parseMoney(typeof v === 'number' ? v : String(v))))
      if (row.every((n) => n === 0)) continue // skip empty rows — keeps the doc lean
      amounts[id] = row
    }
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    return json(await saveBudget(year, amounts, actorOf(user)))
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
