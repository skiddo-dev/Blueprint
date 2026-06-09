import type { PageServerLoad } from './$types'
import { listVendorsWithStats } from '$lib/server/payables'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async () => {
  return { vendors: await listVendorsWithStats() }
}
