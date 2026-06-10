import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getInvoice, getInvoicePayments, listInvoiceCredits } from '$lib/server/invoicing'
import { listAudit } from '$lib/server/audit'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ params }) => {
  const invoice = await getInvoice(params.id)
  if (!invoice) throw error(404, 'Invoice not found')
  const [payments, credits, audit] = await Promise.all([
    getInvoicePayments(params.id),
    listInvoiceCredits(params.id),
    listAudit({ entity_type: 'invoice', entity_id: params.id, limit: 50 }),
  ])
  return { invoice, payments, credits, audit }
}
