import type { PageServerLoad } from './$types'
import { listBills } from '$lib/server/payables'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async () => {
  return { bills: await listBills() }
}
