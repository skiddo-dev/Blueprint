import { env } from '$env/dynamic/private'
import { monthKey, monthsBackStart, emptyProvider, topBreakdown, dollarsToCents } from './shared'
import type { ProviderSpend } from './types'

// OpenAI organization Costs API. Reports actual billed cost (USD) in daily
// buckets, optionally grouped by line item (model / API surface). Requires an
// ADMIN key (sk-admin-…) — a regular project OPENAI_API_KEY can't read org-level
// costs — so this is gated on its own OPENAI_ADMIN_KEY and degrades to a
// "not configured" card when that key is absent.
//
// Docs: GET https://api.openai.com/v1/organization/costs
//   start_time   unix seconds (inclusive)
//   bucket_width "1d" (the only width the costs endpoint supports)
//   group_by     "line_item" to split a day's cost by model/surface
//   page         opaque cursor from a previous response's `next_page`

const BASE = 'https://api.openai.com/v1/organization/costs'

interface CostResult {
  // The Costs API returns `amount.value` as a STRING (e.g. "0.11567415"), though
  // a number is allowed for too — coerce with Number() before using it.
  amount?: { value?: number | string; currency?: string }
  line_item?: string | null
}
interface CostBucket {
  start_time: number
  results?: CostResult[]
}

/** Pure: fold daily cost buckets into the normalized monthly shape. `now` is
 *  injectable so the current/last-month split is testable. */
export function normalizeOpenAiCosts(buckets: CostBucket[], now: Date = new Date()): ProviderSpend {
  // Accumulate in DOLLARS (the API gives amount.value as a string/number — coerce
  // with Number()), then convert to cents once per aggregate. Summing in dollars
  // first means a month of sub-cent line items doesn't evaporate to per-row
  // rounding (each gpt-4o-mini call can cost a tiny fraction of a cent).
  const byMonth = new Map<string, number>()
  const curMonth = monthKey(now)
  const curLineItems = new Map<string, number>()

  for (const b of buckets) {
    const month = monthKey(new Date(b.start_time * 1000))
    for (const r of b.results ?? []) {
      const v = Number(r.amount?.value)
      if (!Number.isFinite(v) || v === 0) continue
      byMonth.set(month, (byMonth.get(month) ?? 0) + v)
      if (month === curMonth) {
        const name = r.line_item || 'Other'
        curLineItems.set(name, (curLineItems.get(name) ?? 0) + v)
      }
    }
  }

  const trend = [...byMonth.entries()]
    .map(([period, dollars]) => ({ period, amountCents: dollarsToCents(dollars) }))
    .sort((a, b) => a.period.localeCompare(b.period))
  const prevMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
  const breakdownCents = new Map<string, number>(
    [...curLineItems].map(([name, dollars]) => [name, dollarsToCents(dollars)]),
  )

  return {
    provider: 'openai',
    label: 'OpenAI',
    configured: true,
    currency: 'USD',
    monthToDateCents: dollarsToCents(byMonth.get(curMonth) ?? 0),
    lastFullMonthCents: byMonth.has(prevMonth) ? dollarsToCents(byMonth.get(prevMonth)!) : undefined,
    trend,
    breakdown: topBreakdown(breakdownCents),
    fetchedAt: now.toISOString(),
  }
}

/** Fetch ~6 months of daily cost buckets and normalize them. Never throws —
 *  returns a `configured:false` card with no key, or `error` on a failed call. */
export async function fetchOpenAiSpend(now: Date = new Date()): Promise<ProviderSpend> {
  const key = env.OPENAI_ADMIN_KEY?.trim()
  if (!key) {
    return emptyProvider('openai', 'OpenAI', {
      hint: 'Set OPENAI_ADMIN_KEY (an admin key, sk-admin-…) to show OpenAI spend.',
    })
  }

  try {
    const startTime = Math.floor(monthsBackStart(now, 5).getTime() / 1000)
    const buckets: CostBucket[] = []
    let page: string | undefined
    // Bounded pagination: ~180 daily buckets across 6 months; stop defensively.
    for (let i = 0; i < 30; i++) {
      const params = new URLSearchParams({ start_time: String(startTime), bucket_width: '1d', limit: '180' })
      params.append('group_by', 'line_item')
      if (page) params.set('page', page)
      const resp = await fetch(`${BASE}?${params}`, {
        headers: { authorization: `Bearer ${key}` },
      })
      if (!resp.ok) throw new Error(`OpenAI costs API ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      const body = (await resp.json()) as { data?: CostBucket[]; has_more?: boolean; next_page?: string }
      buckets.push(...(body.data ?? []))
      if (!body.has_more || !body.next_page) break
      page = body.next_page
    }
    return normalizeOpenAiCosts(buckets, now)
  } catch (e) {
    return emptyProvider('openai', 'OpenAI', { error: e instanceof Error ? e.message : String(e) })
  }
}
