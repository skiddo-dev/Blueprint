import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getInvoice, getInvoicePayments, listInvoiceCredits } from '$lib/server/invoicing'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ params }) => {
  const invoice = await getInvoice(params.id)
  if (!invoice) throw error(404, 'Invoice not found')
  const [payments, credits] = await Promise.all([
    getInvoicePayments(params.id),
    listInvoiceCredits(params.id),
  ])
  return { invoice, payments, credits }
}
