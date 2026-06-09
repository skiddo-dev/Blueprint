import { env } from '$env/dynamic/private'
import { monthKey, monthsBackStart, emptyProvider, topBreakdown, dollarsToCents } from './shared'
import type { ProviderSpend } from './types'

// Azure Cost Management Query API. Reports actual cost (decimal, in the
// subscription's billing currency) and is queried with a POST body describing the
// timeframe + grouping. Authenticated with a management-plane token from the same
// Entra service principal the app already uses for sign-in — that SP must be
// granted the "Cost Management Reader" role on AZURE_SUBSCRIPTION_ID.
//
// Token: POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
//        (client_credentials, scope=https://management.azure.com/.default)
// Query: POST https://management.azure.com/subscriptions/{sub}/providers/
//        Microsoft.CostManagement/query?api-version=2025-03-01

const COST_API_VERSION = '2025-03-01'

interface AzureTable {
  columns?: { name?: string }[]
  rows?: unknown[][]
}

const colIndex = (cols: { name?: string }[] | undefined, ...names: string[]): number =>
  (cols ?? []).findIndex((c) => names.some((n) => (c.name ?? '').toLowerCase() === n.toLowerCase()))

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Pure: combine the two Cost Management result tables (month-to-date grouped by
 *  service, and a daily series for the trend) into the normalized shape. `now` is
 *  injectable for the current/prior-month split. */
export function normalizeAzure(mtd: AzureTable, daily: AzureTable, now: Date = new Date()): ProviderSpend {
  // ── MTD + per-service breakdown ──
  const mCost = colIndex(mtd.columns, 'Cost', 'PreTaxCost', 'CostUSD')
  const mSvc = colIndex(mtd.columns, 'ServiceName')
  const mCur = colIndex(mtd.columns, 'Currency')
  const byService = new Map<string, number>()
  let currency = 'USD'
  let monthToDateCents = 0
  for (const row of mtd.rows ?? []) {
    const c = dollarsToCents(num(row[mCost]))
    monthToDateCents += c
    const name = (mSvc >= 0 ? String(row[mSvc] ?? '') : '') || 'Other'
    byService.set(name, (byService.get(name) ?? 0) + c)
    if (mCur >= 0 && row[mCur]) currency = String(row[mCur])
  }

  // ── Monthly trend from the daily series (UsageDate is an int like 20260615) ──
  const dCost = colIndex(daily.columns, 'Cost', 'PreTaxCost', 'CostUSD')
  const dDate = colIndex(daily.columns, 'UsageDate', 'BillingMonth')
  const byMonth = new Map<string, number>()
  for (const row of daily.rows ?? []) {
    const raw = String(row[dDate] ?? '')
    // 20260615 → "2026-06"; a date string falls back to its first 7 chars.
    const period = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}` : raw.slice(0, 7)
    if (!period) continue
    byMonth.set(period, (byMonth.get(period) ?? 0) + dollarsToCents(num(row[dCost])))
  }

  const trend = [...byMonth.entries()]
    .map(([period, amountCents]) => ({ period, amountCents }))
    .sort((a, b) => a.period.localeCompare(b.period))
  const prevMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))

  return {
    provider: 'azure',
    label: 'Azure',
    configured: true,
    currency,
    monthToDateCents,
    lastFullMonthCents: byMonth.get(prevMonth),
    trend,
    breakdown: topBreakdown(byService),
    fetchedAt: now.toISOString(),
  }
}

async function getToken(tenant: string, clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://management.azure.com/.default',
    }),
  })
  if (!resp.ok) throw new Error(`Azure token ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const body = (await resp.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('Azure token response had no access_token')
  return body.access_token
}

async function runQuery(subscription: string, token: string, body: unknown): Promise<AzureTable> {
  const url = `https://management.azure.com/subscriptions/${encodeURIComponent(
    subscription,
  )}/providers/Microsoft.CostManagement/query?api-version=${COST_API_VERSION}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`Azure cost query ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const json = (await resp.json()) as { properties?: AzureTable }
  return json.properties ?? {}
}

/** Fetch Azure month-to-date (by service) + a 6-month daily series, and
 *  normalize. Never throws — not-configured card without a subscription/SP, or
 *  an error card on failure. */
export async function fetchAzureSpend(now: Date = new Date()): Promise<ProviderSpend> {
  const subscription = env.AZURE_SUBSCRIPTION_ID?.trim()
  const tenant = (env.AZURE_TENANT_ID || env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID)?.trim()
  const clientId = (env.AZURE_CLIENT_ID || env.AUTH_MICROSOFT_ENTRA_ID_ID)?.trim()
  const clientSecret = (env.AZURE_CLIENT_SECRET || env.AUTH_MICROSOFT_ENTRA_ID_SECRET)?.trim()
  if (!subscription || !tenant || !clientId || !clientSecret) {
    return emptyProvider('azure', 'Azure', {
      hint: 'Set AZURE_SUBSCRIPTION_ID and grant the Entra service principal the Cost Management Reader role.',
    })
  }

  try {
    const token = await getToken(tenant, clientId, clientSecret)
    const aggregation = { totalCost: { name: 'Cost', function: 'Sum' } }
    const [mtd, daily] = await Promise.all([
      runQuery(subscription, token, {
        type: 'ActualCost',
        timeframe: 'MonthToDate',
        dataset: { granularity: 'None', aggregation, grouping: [{ type: 'Dimension', name: 'ServiceName' }] },
      }),
      runQuery(subscription, token, {
        type: 'ActualCost',
        timeframe: 'Custom',
        timePeriod: { from: monthsBackStart(now, 5).toISOString(), to: now.toISOString() },
        dataset: { granularity: 'Daily', aggregation },
      }),
    ])
    return normalizeAzure(mtd, daily, now)
  } catch (e) {
    return emptyProvider('azure', 'Azure', { error: e instanceof Error ? e.message : String(e) })
  }
}
