import type { PageServerLoad } from './$types'
import { getInfraSnapshot } from '$lib/server/infra'

// Admin-only (enforced by the page guard in hooks.server.ts). Serves the cached
// infra-spend snapshot, refreshing it inline only when the cache is stale —
// keeps the first paint fast and avoids hammering the rate-limited billing APIs.
export const load: PageServerLoad = async () => {
  return { snapshot: await getInfraSnapshot() }
}
