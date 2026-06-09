import type { PageServerLoad } from './$types'
import { getCashFlow } from '$lib/server/cashflow'

// Admin-only (page guard in hooks.server.ts). Defaults to year-to-date; ?from=&to=
// override the period.
export const load: PageServerLoad = async ({ url }) => {
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get('from') || `${today.slice(0, 4)}-01-01`
  const to = url.searchParams.get('to') || today
  return { from, to, ...(await getCashFlow(from, to)) }
}
