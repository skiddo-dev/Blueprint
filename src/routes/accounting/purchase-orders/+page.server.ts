import type { PageServerLoad } from './$types'
import { listPOs } from '$lib/server/purchaseOrders'

// Admin-only (page guard in hooks.server.ts). All POs with their derived
// billed-so-far and status.
export const load: PageServerLoad = async () => {
  return { pos: await listPOs() }
}
