import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createVendorCredit } from '$lib/server/payables'
import { parseMoney } from '$lib/money'

// Admin-only. Apply a vendor credit against a bill: Dr A/P / Cr the bill's
// expense accounts pro-rata, balance and status recompute, one transaction.
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  if (!body || body.amount === undefined || body.amount === '') throw error(400, 'Expected { amount, date }')

  let amount
  try {
    amount = parseMoney(typeof body.amount === 'number' ? body.amount : String(body.amount))
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const result = await createVendorCredit(
      params.id,
      amount,
      String(body.date ?? new Date().toISOString().slice(0, 10)).trim(),
      { memo: body.memo ? String(body.memo) : undefined, created_by: (user.email as string) ?? (user.displayName as string) },
    )
    return json(result, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
