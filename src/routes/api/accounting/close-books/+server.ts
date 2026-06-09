import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { closeBooks } from '$lib/server/accounting'

// Admin-only. Year-end close: post the closing entry (income/expense → Retained
// Earnings) as of `through` and lock the period there. Idempotent — re-closing
// the same date just re-locks (nothing left to close).
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  const through = String(body?.through ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) throw error(400, 'through must be an ISO YYYY-MM-DD date')

  try {
    const result = await closeBooks(through, (user.email as string) ?? (user.displayName as string))
    return json(result, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
