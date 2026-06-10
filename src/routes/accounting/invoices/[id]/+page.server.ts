import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getInvoice, getInvoicePayments, listInvoiceCredits } from '$lib/server/invoicing'
import { listAudit } from '$lib/server/audit'
import { getAccounts } from '$lib/server/accounting'
import { isCashLike } from '$lib/accounting/coa'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ params }) => {
  const invoice = await getInvoice(params.id)
  if (!invoice) throw error(404, 'Invoice not found')
  const [payments, credits, audit, accounts] = await Promise.all([
    getInvoicePayments(params.id),
    listInvoiceCredits(params.id),
    listAudit({ entity_type: 'invoice', entity_id: params.id, limit: 50 }),
    getAccounts(),
  ])
  // Payment "Deposit to" choices: real bank accounts + Undeposited Funds.
  const depositTargets = accounts.filter((a) => a.active && isCashLike(a))
  return { invoice, payments, credits, audit, depositTargets }
}
