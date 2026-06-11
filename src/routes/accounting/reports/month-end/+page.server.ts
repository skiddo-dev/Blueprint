import type { PageServerLoad } from './$types'
import { getMeta } from '$lib/server/db'
import { aiConfigured, getMonthEndData } from '$lib/server/booksAi'

// Admin-only (page guard in hooks.server.ts). The month-end review: this
// month's deterministic facts + anomaly flags, with the cached AI narrative if
// one was generated. ?month=YYYY-MM, defaulting to the current month.
export const load: PageServerLoad = async ({ url }) => {
  const param = url.searchParams.get('month') ?? ''
  const month = /^\d{4}-\d{2}$/.test(param) ? param : new Date().toISOString().slice(0, 7)
  const [{ facts, anomalies }, cached] = await Promise.all([
    getMonthEndData(month),
    getMeta(`month-end-narrative:${month}`),
  ])
  return {
    month,
    facts,
    anomalies,
    ai: aiConfigured(),
    narrative: (cached?.narrative as string) ?? '',
    narrativeAt: (cached?.generated_at as string) ?? '',
  }
}
