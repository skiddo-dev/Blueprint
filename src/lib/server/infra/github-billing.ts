import { env } from '$env/dynamic/private'
import { monthKey, monthsBackStart, emptyProvider, topBreakdown, dollarsToCents } from './shared'
import type { ProviderSpend } from './types'

// GitHub enhanced-billing usage API. Reports metered usage (Actions minutes,
// storage, Packages, …) priced in USD, one item per day × SKU. Needs a
// fine-grained PAT with the "Plan" account permission (read) for the account
// being read — the gh CLI's OAuth token does NOT carry this — so it's gated on
// its own GITHUB_BILLING_TOKEN + GITHUB_BILLING_USER pair and degrades to a
// "not configured" card when either is absent.
//
// Docs: GET https://api.github.com/users/{username}/settings/billing/usage
//   year / month  scope the report; we call once per month in the window
//
// Amounts: we surface netAmount — what GitHub actually bills after the plan's
// included quota is applied (grossAmount − discountAmount). Usage fully covered
// by the free tier therefore shows as $0, which matches this page's semantics
// (real spend, not quota consumption).

const API_BASE = 'https://api.github.com'

export interface GitHubUsageItem {
  /** ISO date, e.g. "2026-06-05". */
  date?: string
  /** Coarse product, e.g. "actions". */
  product?: string
  /** Specific SKU, e.g. "Actions Linux". */
  sku?: string
  /** USD actually billed for this item (after included-quota discounts). */
  netAmount?: number
}

/** Pure: fold per-day usage items into the normalized monthly shape. `now` is
 *  injectable so the current/last-month split is testable. */
export function normalizeGitHubUsage(items: GitHubUsageItem[], now: Date = new Date()): ProviderSpend {
  // Accumulate in DOLLARS, convert to cents once per aggregate: a month of
  // per-minute Actions rows is mostly sub-cent amounts that per-row rounding
  // would evaporate (same pitfall as the OpenAI client).
  const byMonth = new Map<string, number>()
  const curMonth = monthKey(now)
  const curLineItems = new Map<string, number>()

  for (const it of items) {
    // "YYYY-MM-DD" parses as UTC midnight, matching monthKey's UTC bucketing.
    const d = new Date(it.date ?? '')
    if (Number.isNaN(+d)) continue
    const v = Number(it.netAmount)
    if (!Number.isFinite(v) || v === 0) continue
    const month = monthKey(d)
    byMonth.set(month, (byMonth.get(month) ?? 0) + v)
    if (month === curMonth) {
      const name = it.sku || it.product || 'Other'
      curLineItems.set(name, (curLineItems.get(name) ?? 0) + v)
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
    provider: 'github',
    label: 'GitHub',
    configured: true,
    currency: 'USD',
    monthToDateCents: dollarsToCents(byMonth.get(curMonth) ?? 0),
    lastFullMonthCents: byMonth.has(prevMonth) ? dollarsToCents(byMonth.get(prevMonth)!) : undefined,
    trend,
    breakdown: topBreakdown(breakdownCents),
    fetchedAt: now.toISOString(),
  }
}

/** Fetch the last ~6 months of usage (one request per month) and normalize.
 *  Never throws — returns a `configured:false` card when creds are unset, or
 *  `error` on a failed call. */
export async function fetchGitHubSpend(now: Date = new Date()): Promise<ProviderSpend> {
  const token = env.GITHUB_BILLING_TOKEN?.trim()
  const user = env.GITHUB_BILLING_USER?.trim()
  if (!token || !user) {
    return emptyProvider('github', 'GitHub', {
      hint: 'Set GITHUB_BILLING_TOKEN (fine-grained PAT with the "Plan" read permission) and GITHUB_BILLING_USER to show GitHub spend.',
    })
  }

  try {
    const items: GitHubUsageItem[] = []
    // One request per month in the window — month-scoped reports stay small and
    // sidestep any ambiguity about the endpoint's default period.
    for (let back = 5; back >= 0; back--) {
      const start = monthsBackStart(now, back)
      const params = new URLSearchParams({
        year: String(start.getUTCFullYear()),
        month: String(start.getUTCMonth() + 1),
      })
      const resp = await fetch(
        `${API_BASE}/users/${encodeURIComponent(user)}/settings/billing/usage?${params}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
          },
        },
      )
      if (!resp.ok) throw new Error(`GitHub billing API ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      const body = (await resp.json()) as { usageItems?: GitHubUsageItem[] }
      items.push(...(body.usageItems ?? []))
    }
    return normalizeGitHubUsage(items, now)
  } catch (e) {
    return emptyProvider('github', 'GitHub', { error: e instanceof Error ? e.message : String(e) })
  }
}
