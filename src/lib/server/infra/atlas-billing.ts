import { env } from '$env/dynamic/private'
import { digestFetch } from './digest'
import { monthKey, monthsBackStart, emptyProvider, topBreakdown, dollarsToCents } from './shared'
import type { ProviderSpend } from './types'

// MongoDB Atlas Administration API — organization billing via the COST EXPLORER,
// not the Invoices endpoint. The current month's invoice is PENDING and its line
// items / subtotal aren't metered until later in the period (it reads $0 mid-month
// even when usage is accruing), so Invoices badly under-reports current spend.
// Cost Explorer returns the real accrued usage (it's what the Atlas billing UI
// shows). Amounts are decimal dollars → dollarsToCents at the boundary.
//
// Auth is HTTP Digest with a programmatic API key pair (Org Billing Viewer role).
// The report is generated ASYNCHRONOUSLY:
//   POST /orgs/{orgId}/billing/costExplorer/usage  → { token }   (org filter required)
//   GET  /orgs/{orgId}/billing/costExplorer/usage/{token} → 202 while pending,
//        then 200 { usageDetails: [{ usageAmount, usageDate, service? }] }

const BASE = 'https://cloud.mongodb.com/api/atlas/v2'
const ATLAS_VERSION = 'application/vnd.atlas.2023-01-01+json'

interface UsageDetail {
  usageAmount?: number // decimal dollars
  usageDate?: string // 'YYYY-MM-DD' (bucketed to the billing month's first day)
  service?: string
  clusterName?: string
  groupName?: string
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10)

/** Pure: fold Cost Explorer usage into the normalized monthly shape. `mtd` is the
 *  current-month query (optionally grouped by service); `trend` is the multi-month
 *  query. Amounts are summed in dollars then converted to cents once. `now` is
 *  injectable for the current/prior-month split. */
export function normalizeAtlasUsage(
  mtd: UsageDetail[],
  trend: UsageDetail[],
  now: Date = new Date(),
): ProviderSpend {
  // Month-to-date total + per-service breakdown (falls back to one labeled line
  // when Atlas returns an ungrouped aggregate, so the card never shows a number
  // next to "no charges").
  const byService = new Map<string, number>()
  let mtdDollars = 0
  for (const u of mtd) {
    const v = Number(u.usageAmount) || 0
    if (!v) continue
    mtdDollars += v
    const name = u.service || u.clusterName || u.groupName || 'MongoDB Atlas'
    byService.set(name, (byService.get(name) ?? 0) + v)
  }
  const breakdownCents = new Map<string, number>(
    [...byService].map(([name, dollars]) => [name, dollarsToCents(dollars)]),
  )

  // Monthly trend, bucketed by the UTC month of each entry's usageDate.
  const byMonth = new Map<string, number>()
  for (const u of trend) {
    if (!u.usageDate) continue
    const period = monthKey(new Date(u.usageDate))
    byMonth.set(period, (byMonth.get(period) ?? 0) + (Number(u.usageAmount) || 0))
  }
  const trendPts = [...byMonth.entries()]
    .map(([period, dollars]) => ({ period, amountCents: dollarsToCents(dollars) }))
    .sort((a, b) => a.period.localeCompare(b.period))
  const prevMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))

  return {
    provider: 'atlas',
    label: 'MongoDB Atlas',
    configured: true,
    currency: 'USD',
    monthToDateCents: dollarsToCents(mtdDollars),
    lastFullMonthCents: byMonth.has(prevMonth) ? dollarsToCents(byMonth.get(prevMonth)!) : undefined,
    trend: trendPts,
    breakdown: topBreakdown(breakdownCents),
    fetchedAt: now.toISOString(),
  }
}

/** Run one Cost Explorer report (create → poll for the result). Throws on a
 *  non-2xx or if it never becomes ready. */
async function costExplorerUsage(args: {
  orgId: string
  username: string
  password: string
  startDate: string
  endDate: string
  groupBy?: string
}): Promise<UsageDetail[]> {
  const base = `${BASE}/orgs/${encodeURIComponent(args.orgId)}/billing/costExplorer/usage`
  const body = JSON.stringify({
    startDate: args.startDate,
    endDate: args.endDate,
    organizations: [args.orgId], // required filter
    ...(args.groupBy ? { groupBy: args.groupBy } : {}),
  })
  const created = await digestFetch(base, {
    method: 'POST',
    username: args.username,
    password: args.password,
    headers: { accept: ATLAS_VERSION, 'content-type': ATLAS_VERSION },
    body,
  })
  if (!created.ok) throw new Error(`Atlas Cost Explorer create ${created.status}: ${(await created.text()).slice(0, 200)}`)
  const token = ((await created.json()) as { token?: string }).token
  if (!token) throw new Error('Atlas Cost Explorer returned no token')

  // Poll: the report is 202 while generating, 200 when ready (usually immediate).
  for (let i = 0; i < 6; i++) {
    const r = await digestFetch(`${base}/${token}`, {
      username: args.username,
      password: args.password,
      headers: { accept: ATLAS_VERSION },
    })
    if (r.status === 200) return ((await r.json()) as { usageDetails?: UsageDetail[] }).usageDetails ?? []
    if (r.status !== 202) throw new Error(`Atlas Cost Explorer fetch ${r.status}: ${(await r.text()).slice(0, 200)}`)
    await new Promise((res) => setTimeout(res, 800))
  }
  throw new Error('Atlas Cost Explorer report did not become ready')
}

/** Fetch current-month + ~6-month Atlas usage via Cost Explorer and normalize.
 *  Never throws — not-configured card without keys, or an error card on failure. */
export async function fetchAtlasSpend(now: Date = new Date()): Promise<ProviderSpend> {
  const username = env.ATLAS_API_PUBLIC_KEY?.trim()
  const password = env.ATLAS_API_PRIVATE_KEY?.trim()
  const orgId = env.ATLAS_ORG_ID?.trim()
  if (!username || !password || !orgId) {
    return emptyProvider('atlas', 'MongoDB Atlas', {
      hint: 'Set ATLAS_API_PUBLIC_KEY, ATLAS_API_PRIVATE_KEY and ATLAS_ORG_ID (key needs Org Billing Viewer).',
    })
  }

  try {
    const monthStart = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
    const nextMonthStart = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)))
    const sixMonthsAgo = ymd(monthsBackStart(now, 5))
    const [mtd, trend] = await Promise.all([
      costExplorerUsage({ orgId, username, password, startDate: monthStart, endDate: nextMonthStart, groupBy: 'SERVICES' }),
      costExplorerUsage({ orgId, username, password, startDate: sixMonthsAgo, endDate: nextMonthStart }),
    ])
    return normalizeAtlasUsage(mtd, trend, now)
  } catch (e) {
    return emptyProvider('atlas', 'MongoDB Atlas', { error: e instanceof Error ? e.message : String(e) })
  }
}
