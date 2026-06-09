import type { PageServerLoad } from './$types'
import { listCustomersWithStats } from '$lib/server/invoicing'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async () => {
  return { customers: await listCustomersWithStats() }
}
