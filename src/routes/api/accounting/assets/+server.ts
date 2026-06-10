import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createAsset } from '$lib/server/assets'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { parseMoney } from '$lib/money'

// Admin-only. Register a fixed asset (the purchase itself is normally a bill
// or expense hitting 1500 — this is the depreciation-tracking record).
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !body.name || body.cost === undefined || !body.life_months) {
    throw error(400, 'Expected { name, acquired_date, cost, life_months, salvage?, in_service? }')
  }
  try {
    const asset = await createAsset({
      name: String(body.name),
      acquired_date: String(body.acquired_date ?? new Date().toISOString().slice(0, 10)),
      in_service: body.in_service ? String(body.in_service) : undefined,
      cost: parseMoney(typeof body.cost === 'number' ? body.cost : String(body.cost)),
      salvage: body.salvage !== undefined && body.salvage !== '' ? parseMoney(typeof body.salvage === 'number' ? body.salvage : String(body.salvage)) : undefined,
      life_months: Number(body.life_months),
      created_by: actorOf(user),
    })
    return json(asset, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
