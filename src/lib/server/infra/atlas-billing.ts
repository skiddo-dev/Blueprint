import { env } from '$env/dynamic/private'
import { digestFetch } from './digest'
import { monthKey, monthsBackStart, emptyProvider, topBreakdown } from './shared'
import type { ProviderSpend } from './types'

// MongoDB Atlas Administration API — organization invoices. Atlas reports money
// already in integer cents (amountBilledCents / totalPriceCents), so there's no
// float conversion here. Auth is HTTP Digest with a programmatic API key pair
// (public/private); the key needs the Organization Billing Viewer role.
//
// GET https://cloud.mongodb.com/api/atlas/v2/orgs/{orgId}/invoices
//   Accept: application/vnd.atlas.2023-01-01+json   (v2 requires a dated version)
//
// Each invoice covers one billing period; the in-progress month's invoice is
// PENDING and accrues = month-to-date. Closed invoices give the monthly trend.

const BASE = 'https://cloud.mongodb.com/api/atlas/v2'
const ATLAS_VERSION = 'application/vnd.atlas.2023-01-01+json'

interface AtlasLineItem {
  sku?: string
  groupName?: string
  totalPriceCents?: number
}
interface AtlasInvoice {
  startDate?: string
  endDate?: string
  amountBilledCents?: number
  statusName?: string
  lineItems?: AtlasLineItem[]
}

const intCents = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0)

/** Pure: fold Atlas invoices into the normalized monthly shape. Invoices are
 *  bucketed by the UTC month of their `startDate`. `now` is injectable for the
 *  current/prior-month split. */
export function normalizeAtlasInvoices(invoices: AtlasInvoice[], now: Date = new Date()): ProviderSpend {
  const byMonth = new Map<string, number>()
  const curMonth = monthKey(now)
  let currentInvoice: AtlasInvoice | undefined
  let latest: { period: string; inv: AtlasInvoice } | undefined

  for (const inv of invoices) {
    if (!inv.startDate) continue
    const period = monthKey(new Date(inv.startDate))
    byMonth.set(period, (byMonth.get(period) ?? 0) + intCents(inv.amountBilledCents))
    if (period === curMonth) currentInvoice = inv
    if (!latest || period > latest.period) latest = { period, inv }
  }

  // Breakdown from the current month's invoice if present, else the most recent.
  const sourceInvoice = currentInvoice ?? latest?.inv
  const bySku = new Map<string, number>()
  for (const li of sourceInvoice?.lineItems ?? []) {
    const name = li.sku || li.groupName || 'Other'
    bySku.set(name, (bySku.get(name) ?? 0) + intCents(li.totalPriceCents))
  }

  const trend = [...byMonth.entries()]
    .map(([period, amountCents]) => ({ period, amountCents }))
    .sort((a, b) => a.period.localeCompare(b.period))
  const prevMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))

  return {
    provider: 'atlas',
    label: 'MongoDB Atlas',
    configured: true,
    currency: 'USD',
    monthToDateCents: byMonth.get(curMonth) ?? 0,
    lastFullMonthCents: byMonth.get(prevMonth),
    trend,
    breakdown: topBreakdown(bySku),
    fetchedAt: now.toISOString(),
  }
}

/** Fetch recent org invoices and normalize them. Never throws — returns a
 *  not-configured card without keys, or an error card on a failed call. */
export async function fetchAtlasSpend(now: Date = new Date()): Promise<ProviderSpend> {
  const pub = env.ATLAS_API_PUBLIC_KEY?.trim()
  const priv = env.ATLAS_API_PRIVATE_KEY?.trim()
  const orgId = env.ATLAS_ORG_ID?.trim()
  if (!pub || !priv || !orgId) {
    return emptyProvider('atlas', 'MongoDB Atlas', {
      hint: 'Set ATLAS_API_PUBLIC_KEY, ATLAS_API_PRIVATE_KEY and ATLAS_ORG_ID (key needs Org Billing Viewer).',
    })
  }

  try {
    // A generous page of recent invoices; the normalizer sorts + windows them.
    const fromMonth = monthKey(monthsBackStart(now, 5))
    const url = `${BASE}/orgs/${encodeURIComponent(orgId)}/invoices?itemsPerPage=24&pageNum=1`
    const resp = await digestFetch(url, {
      username: pub,
      password: priv,
      headers: { accept: ATLAS_VERSION },
    })
    if (!resp.ok) throw new Error(`Atlas invoices API ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
    const body = (await resp.json()) as { results?: AtlasInvoice[] }
    const invoices = (body.results ?? []).filter((inv) => !inv.startDate || monthKey(new Date(inv.startDate)) >= fromMonth)
    return normalizeAtlasInvoices(invoices, now)
  } catch (e) {
    return emptyProvider('atlas', 'MongoDB Atlas', { error: e instanceof Error ? e.message : String(e) })
  }
}
