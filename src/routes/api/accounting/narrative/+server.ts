import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getMeta, setMeta } from '$lib/server/db'
import { getMonthEndData, narrateMonthEnd } from '$lib/server/booksAi'

const metaKey = (month: string) => `month-end-narrative:${month}`

// Admin-only. Generate (or re-generate) the month-end narrative for a month.
// The numbers on the page are always computed fresh and deterministically —
// only the prose is cached (per month, in meta) so repeat visits don't re-bill
// the model. `force: true` regenerates after new postings.
export const POST: RequestHandler = async ({ request, locals }) => {
  await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  const month = String(body?.month ?? '')
  if (!/^\d{4}-\d{2}$/.test(month)) throw error(400, 'Expected { month: "YYYY-MM" }')

  if (!body?.force) {
    const cached = await getMeta(metaKey(month))
    if (cached?.narrative) {
      return json({ narrative: cached.narrative, generated_at: cached.generated_at, ai: cached.ai === true, cached: true })
    }
  }

  const { facts } = await getMonthEndData(month)
  const { narrative, ai } = await narrateMonthEnd(facts)
  const generated_at = new Date().toISOString()
  await setMeta(metaKey(month), { narrative, generated_at, ai })
  return json({ narrative, generated_at, ai, cached: false })
}
