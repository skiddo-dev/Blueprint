import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getInvoice, getInvoicePayments } from '$lib/server/invoicing'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ params }) => {
  const invoice = await getInvoice(params.id)
  if (!invoice) throw error(404, 'Invoice not found')
  return { invoice, payments: await getInvoicePayments(params.id) }
}
