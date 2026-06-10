import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { voidInvoice } from '$lib/server/invoicing'

// Admin-only. Void an un-settled invoice: reverses its journal entry (dated
// today) and marks it void. Invoices with payments/credits → 400 with guidance.
export const POST: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  try {
    const invoice = await voidInvoice(params.id, { created_by: (user.email as string) ?? (user.displayName as string) })
    return json(invoice)
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
