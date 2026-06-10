import type { PageServerLoad } from './$types'
import { listAssets } from '$lib/server/assets'

// Admin-only (page guard in hooks.server.ts). The fixed-asset register with
// posted accumulated depreciation and book values.
export const load: PageServerLoad = async () => {
  return { assets: await listAssets() }
}
