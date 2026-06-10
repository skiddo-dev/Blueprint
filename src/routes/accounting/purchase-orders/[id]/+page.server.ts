import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getPO } from '$lib/server/purchaseOrders'
import { listAudit } from '$lib/server/audit'

// Admin-only (page guard in hooks.server.ts). One PO with its linked bills,
// derived billed/status, and activity.
export const load: PageServerLoad = async ({ params }) => {
  const po = await getPO(params.id)
  if (!po) throw error(404, 'Purchase order not found')
  const audit = await listAudit({ entity_type: 'purchase-order', entity_id: params.id, limit: 50 })
  return { po, audit }
}
