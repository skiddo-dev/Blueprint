import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { voidBill } from '$lib/server/payables'

// Admin-only. Void an un-settled bill: reverses its journal entry (dated today)
// and marks it void. Bills with payments/credits → 400 with guidance.
export const POST: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  try {
    const bill = await voidBill(params.id, { created_by: (user.email as string) ?? (user.displayName as string) })
    return json(bill)
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
