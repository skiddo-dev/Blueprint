import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getAsset } from '$lib/server/assets'
import { listAudit } from '$lib/server/audit'
import { getBankAccounts } from '$lib/server/reconciliation'

// Admin-only (page guard in hooks.server.ts). One asset: its schedule with
// posted ticks, disposal form, and activity.
export const load: PageServerLoad = async ({ params }) => {
  const asset = await getAsset(params.id)
  if (!asset) throw error(404, 'Asset not found')
  const [audit, bankAccounts] = await Promise.all([
    listAudit({ entity_type: 'fixed-asset', entity_id: params.id, limit: 50 }),
    getBankAccounts(),
  ])
  return { asset, audit, bankAccounts }
}
