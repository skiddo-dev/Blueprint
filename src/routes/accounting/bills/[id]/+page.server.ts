import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getBill, getBillPayments, listBillCredits } from '$lib/server/payables'
import { listAudit } from '$lib/server/audit'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ params }) => {
  const bill = await getBill(params.id)
  if (!bill) throw error(404, 'Bill not found')
  const [payments, credits, audit] = await Promise.all([
    getBillPayments(params.id),
    listBillCredits(params.id),
    listAudit({ entity_type: 'bill', entity_id: params.id, limit: 50 }),
  ])
  return { bill, payments, credits, audit }
}
