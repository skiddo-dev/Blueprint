import type { PageServerLoad } from './$types'
import { getApAging } from '$lib/server/payables'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async () => {
  return { aging: await getApAging() }
}
