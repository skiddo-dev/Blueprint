// ATTOM Data API client for the warehouse-prospecting feature.
//
// Pulls commercial/industrial properties within a radius of a lat/lng and within
// a building-size window, normalizes ATTOM's nested JSON into our flat Prospect
// shape, and (defensively) re-applies the radius + size filters client-side.
//
// Secrets are read at RUNTIME via $env/dynamic/private (NOT process.env — empty
// under Vite 8 SSR; same root cause documented in db.ts / openai.ts). When no
// ATTOM_API_KEY is set, or USE_MOCK_DATA=true, we transparently fall back to the
// mock generator so the Prospects page is fully usable without a paid key.
//
// NOTE ON FIELD PATHS: ATTOM returns different blocks depending on which data
// package your subscription includes, and the exact property-type vocabulary is
// defined by their data dictionary. The normalizer below reads every field
// defensively (optional paths + fallbacks); if your subscription labels
// warehouses differently, set ATTOM_PROPERTY_TYPE accordingly. The size + radius
// filters are always re-applied here so results honor the request regardless.
import { env } from '$env/dynamic/private'
import type { Prospect } from '$lib/types'
import { milesBetween } from '$lib/geo'
import { generateMockProspects } from './mock'

const DEFAULT_BASE = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0'
const PAGE_SIZE = 50
const MAX_PAGES = 4 // hard cap → at most 200 records per pull

export interface ProspectQuery {
  lat: number
  lng: number
  radiusMiles: number
  minSqft: number
  maxSqft: number
}

/** True when a real ATTOM key is configured (live mode), false when we fall back
 *  to mock data. Surfaced in the UI so an admin knows whether results are real. */
export function hasAttomKey(): boolean {
  return !!env.ATTOM_API_KEY && env.USE_MOCK_DATA !== 'true'
}

// ── Safe deep getter ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function get(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** Map one ATTOM property record to our Prospect. Pure (no env/IO) so it can be
 *  unit-tested against a captured ATTOM response. `center` is used to compute
 *  distance when ATTOM doesn't return location.distance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeAttomProperty(p: any, center: { lat: number; lng: number }): Prospect {
  const attomId = String(
    get(p, 'identifier.attomId') ?? get(p, 'identifier.Id') ?? get(p, 'identifier.obPropId') ?? crypto.randomUUID(),
  )
  const lat = num(get(p, 'location.latitude'))
  const lng = num(get(p, 'location.longitude'))
  const oneLine = get(p, 'address.oneLine') as string | undefined
  const line1 = get(p, 'address.line1') as string | undefined
  const city = get(p, 'address.locality') as string | undefined
  const state = get(p, 'address.countrySubd') as string | undefined
  const zip = get(p, 'address.postal1') as string | undefined
  const address =
    oneLine ?? [line1, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(', ')

  // Building size: ATTOM exposes it under a few keys depending on package.
  const buildingSqft =
    num(get(p, 'building.size.universalsize')) ??
    num(get(p, 'building.size.bldgsize')) ??
    num(get(p, 'building.size.grosssize')) ??
    num(get(p, 'building.size.livingsize'))

  const distAttom = num(get(p, 'location.distance'))
  const distance =
    distAttom ?? (lat != null && lng != null ? milesBetween(center.lat, center.lng, lat, lng) : undefined)

  const ownerFull = get(p, 'assessment.owner.owner1.fullname') as string | undefined
  const ownerParts = [
    get(p, 'assessment.owner.owner1.firstnameandmi'),
    get(p, 'assessment.owner.owner1.lastname'),
  ]
    .filter(Boolean)
    .join(' ')
  const owner = ownerFull ?? (ownerParts || undefined)

  return {
    _id: attomId,
    attom_id: attomId,
    address,
    street: line1,
    city,
    state,
    zip,
    latitude: lat,
    longitude: lng,
    building_sqft: buildingSqft,
    lot_acres: num(get(p, 'lot.lotsize1')),
    year_built: num(get(p, 'summary.yearbuilt')),
    property_type: (get(p, 'summary.proptype') as string | undefined) ?? (get(p, 'summary.propclass') as string | undefined),
    property_use: get(p, 'summary.propsubtype') as string | undefined,
    owner,
    assessed_value: num(get(p, 'assessment.assessed.assdttlvalue')),
    market_value: num(get(p, 'assessment.market.mktttlvalue')),
    last_sale_amount: num(get(p, 'sale.amount.saleamt')),
    last_sale_date:
      (get(p, 'sale.saleTransDate') as string | undefined) ??
      (get(p, 'sale.salesearchdate') as string | undefined),
    distance_miles: distance == null ? undefined : Number(distance.toFixed(1)),
    source: 'attom',
    created_at: new Date().toISOString(),
  }
}

/** Fetch warehouse prospects for the given query. Falls back to mock data when
 *  no ATTOM key is configured (or USE_MOCK_DATA=true). */
export async function fetchProspects(q: ProspectQuery): Promise<Prospect[]> {
  if (!hasAttomKey()) {
    return generateMockProspects({
      lat: q.lat,
      lng: q.lng,
      radiusMiles: q.radiusMiles,
      minSqft: q.minSqft,
      maxSqft: q.maxSqft,
    })
  }

  const base = (env.ATTOM_API_BASE || DEFAULT_BASE).replace(/\/$/, '')
  const propertyType = env.ATTOM_PROPERTY_TYPE || 'WAREHOUSE'
  const center = { lat: q.lat, lng: q.lng }
  const collected: Prospect[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${base}/property/snapshot`)
    url.searchParams.set('latitude', String(q.lat))
    url.searchParams.set('longitude', String(q.lng))
    url.searchParams.set('radius', String(q.radiusMiles))
    if (propertyType) url.searchParams.set('propertytype', propertyType)
    // ATTOM size filters (when supported by the package). We also re-filter below.
    url.searchParams.set('minUniversalSize', String(q.minSqft))
    url.searchParams.set('maxUniversalSize', String(q.maxSqft))
    url.searchParams.set('page', String(page))
    url.searchParams.set('pagesize', String(PAGE_SIZE))

    const res = await fetch(url, {
      headers: { apikey: env.ATTOM_API_KEY as string, Accept: 'application/json' },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ATTOM ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ''}`)
    }
    const data = await res.json()
    const records: unknown[] = Array.isArray(data?.property) ? data.property : []
    for (const r of records) collected.push(normalizeAttomProperty(r, center))

    const total = num(get(data, 'status.total')) ?? records.length
    if (records.length < PAGE_SIZE || collected.length >= total) break
  }

  // Re-apply the hard requirements (radius + size window) and de-dup by attom_id.
  const byId = new Map<string, Prospect>()
  for (const p of collected) {
    if (p.distance_miles != null && p.distance_miles > q.radiusMiles) continue
    if (p.building_sqft != null && (p.building_sqft < q.minSqft || p.building_sqft > q.maxSqft)) continue
    byId.set(p.attom_id, p)
  }
  return [...byId.values()].sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0))
}
