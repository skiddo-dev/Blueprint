// Oakland County parcel-GIS enrichment for the warehouse-prospecting feature.
//
// OpenStreetMap gives us warehouse LOCATIONS and footprint size (see osm.ts) but
// no assessment data. This module fills the financial picture by asking Oakland
// County's free, public ArcGIS REST parcel service which parcel a prospect's
// point falls in, then copying over the assessed/taxable value, an authoritative
// site address, and the Michigan property-class label.
//
// LIMITATIONS (by design of the free public layer):
//   • Legal OWNER names are withheld (the public layer's NAME1/NAME2 are always
//     null — owner lookups are gated behind the county's paid Property Gateway),
//     so we leave Prospect.owner as the OSM occupant label rather than overwrite it.
//   • Coverage is Oakland County only. A prospect outside the county (the search
//     radius spills into Macomb/Wayne/etc.) simply comes back un-enriched.
//
// Best-effort throughout: any network/parse failure on a single parcel leaves
// that prospect untouched and never fails the whole pull. Endpoint is read at
// RUNTIME via $env/dynamic/private so it can be repointed without a rebuild.
import { env } from '$env/dynamic/private'
import type { Prospect } from '$lib/types'

const DEFAULT_PARCELS_URL =
  'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1'
// MI law: State Equalized (assessed) value is 50% of true-cash (market) value.
const ASSESSED_TO_MARKET = 2
const ENRICH_CONCURRENCY = 6
const PARCEL_TIMEOUT_MS = 12_000

// Michigan property-class code → human label (first digit is the class family).
const CLASS_FAMILY: Record<string, string> = {
  '1': 'Agricultural',
  '2': 'Commercial',
  '3': 'Industrial',
  '4': 'Residential',
  '5': 'Timber-Cutover',
  '6': 'Developmental',
}

// The parcel attributes we request from the layer (see field schema in parcels logic).
export interface ParcelAttributes {
  SITEADDRESS?: string | null
  SITECITY?: string | null
  SITESTATE?: string | null
  SITEZIP5?: string | null
  ASSESSEDVALUE?: number | null
  TAXABLEVALUE?: number | null
  CLASSCODE?: string | null
  STRUCTURE_DESC?: string | null
}

const OUT_FIELDS = 'SITEADDRESS,SITECITY,SITESTATE,SITEZIP5,ASSESSEDVALUE,TAXABLEVALUE,CLASSCODE,STRUCTURE_DESC'

/** Human label for a Michigan property-class code (e.g. "201" → "Commercial").
 *  Returns undefined for an empty/unknown code. Pure — unit-tested. */
export function classLabel(code: string | null | undefined): string | undefined {
  const c = (code ?? '').trim()
  if (!c) return undefined
  return CLASS_FAMILY[c[0]] ?? undefined
}

const posInt = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined

/** Merge a parcel record's attributes onto a prospect. Only fills fields the GIS
 *  actually knows; never clobbers a value with null/zero. Leaves `owner`
 *  untouched (the public layer withholds it). Pure — unit-tested. */
export function applyParcelAttributes(p: Prospect, a: ParcelAttributes): Prospect {
  const assessed = posInt(a.ASSESSEDVALUE)
  const market = assessed != null ? assessed * ASSESSED_TO_MARKET : undefined
  const use = classLabel(a.CLASSCODE) ?? p.property_use
  // Prefer the county's authoritative site address when OSM had none.
  const street = a.SITEADDRESS?.trim() || undefined
  const city = a.SITECITY?.trim() || undefined
  const zip = a.SITEZIP5?.trim() || undefined
  const hadOsmAddress = !!p.street
  const address = !hadOsmAddress && street
    ? [street, [city, a.SITESTATE?.trim() || 'MI'].filter(Boolean).join(', '), zip].filter(Boolean).join(', ')
    : p.address

  return {
    ...p,
    address,
    street: p.street ?? street,
    city: p.city ?? city,
    state: p.state ?? (a.SITESTATE?.trim() || undefined),
    zip: p.zip ?? zip,
    property_use: use,
    ...(assessed != null ? { assessed_value: assessed } : {}),
    ...(market != null ? { market_value: market } : {}),
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Query the parcel that contains a point and return its attributes, or null if
 *  no parcel matches / the request fails (best-effort). */
async function queryParcel(base: string, lat: number, lng: number): Promise<ParcelAttributes | null> {
  const url = new URL(`${base.replace(/\/$/, '')}/query`)
  url.searchParams.set('geometry', `${lng},${lat}`)
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('outFields', OUT_FIELDS)
  url.searchParams.set('returnGeometry', 'false')
  url.searchParams.set('resultRecordCount', '1')
  url.searchParams.set('f', 'json')
  try {
    const res = await fetchWithTimeout(url.toString(), PARCEL_TIMEOUT_MS)
    if (!res.ok) return null
    const data = (await res.json()) as { features?: Array<{ attributes?: ParcelAttributes }> }
    return data?.features?.[0]?.attributes ?? null
  } catch {
    return null
  }
}

/** Enrich a batch of prospects with Oakland County parcel data, in place by
 *  value. Runs with bounded concurrency; prospects with no lat/lng or no matching
 *  parcel pass through unchanged. Never throws. */
export async function enrichWithParcels(prospects: Prospect[]): Promise<Prospect[]> {
  const base = (env.OAKLAND_PARCELS_URL || DEFAULT_PARCELS_URL).trim()
  const out = [...prospects]
  let cursor = 0

  async function worker() {
    while (cursor < out.length) {
      const i = cursor++
      const p = out[i]
      if (p.latitude == null || p.longitude == null) continue
      const attrs = await queryParcel(base, p.latitude, p.longitude)
      if (attrs) out[i] = applyParcelAttributes(p, attrs)
    }
  }

  const workers = Array.from({ length: Math.min(ENRICH_CONCURRENCY, out.length) }, worker)
  await Promise.all(workers)
  return out
}
