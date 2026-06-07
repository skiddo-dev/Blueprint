// OpenStreetMap / Overpass client for the warehouse-prospecting feature.
//
// Replaces the old paid ATTOM feed with a free, key-less live source: it asks
// the Overpass API for `building=warehouse` / `building=industrial` footprints
// within a radius of the search center and normalizes each into our flat
// Prospect shape. Because OSM has no assessment data, building SIZE is derived
// from the building's footprint polygon (area × storeys) — that's what powers
// the 45k–75k sq ft filter — and the legal owner is filled later by the county
// parcel enrichment (see parcels.ts). The business `name`/`operator`/`brand`
// tag is surfaced as the owner/occupant label in the meantime.
//
// Secrets-free, but the endpoint is read at RUNTIME via $env/dynamic/private so
// an operator can point at a faster Overpass mirror (OVERPASS_API_URL) without a
// rebuild — same pattern as db.ts / the former attom.ts.
import { env } from '$env/dynamic/private'
import type { Prospect } from '$lib/types'
import { milesBetween } from '$lib/geo'

const DEFAULT_OVERPASS = 'https://overpass-api.de/api/interpreter'
const SQM_TO_SQFT = 10.7639
const EARTH_R_M = 6378137 // WGS-84 equatorial radius, metres
// Identify ourselves per the Overpass usage policy (anonymous bulk hits get throttled).
const USER_AGENT = 'BlueprintProspects/1.0 (warehouse prospecting; +https://github.com/skiddo-dev)'

export interface ProspectQuery {
  lat: number
  lng: number
  radiusMiles: number
  minSqft: number
  maxSqft: number
}

// One vertex of an OSM way/relation outline, as returned by Overpass `out geom`.
export interface LatLng {
  lat: number
  lon: number
}

// The slice of an Overpass element we care about (way or relation with either a
// full `geometry` outline or just a `center`, plus its free-form `tags`).
export interface OverpassElement {
  type: string
  id: number
  tags?: Record<string, string>
  center?: LatLng
  geometry?: LatLng[]
}

/** Planar approximation of a closed lat/lng ring's area in square feet. Uses the
 *  spherical-excess shoelace formula (good to a fraction of a percent at a single
 *  building's scale) so we never need a projection lib. Returns 0 for a
 *  degenerate ring (<3 distinct points). Pure — unit-tested. */
export function footprintSqft(ring: LatLng[] | undefined): number {
  if (!ring || ring.length < 3) return 0
  // Drop a trailing closing vertex if Overpass repeated the first point.
  const pts = ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon
    ? ring.slice(0, -1)
    : ring
  if (pts.length < 3) return 0
  const toRad = (d: number) => (d * Math.PI) / 180
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i]
    const p2 = pts[(i + 1) % pts.length]
    sum += toRad(p2.lon - p1.lon) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)))
  }
  const sqm = Math.abs((sum * EARTH_R_M * EARTH_R_M) / 2)
  return Math.round(sqm * SQM_TO_SQFT)
}

const numTag = (v: string | undefined): number | undefined => {
  if (v == null || v === '') return undefined
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

/** Best one-line address from OSM `addr:*` tags, or undefined if none are set. */
function osmAddress(t: Record<string, string>): { address?: string; street?: string; city?: string; state?: string; zip?: string } {
  const house = t['addr:housenumber']
  const street = t['addr:street']
  const line1 = [house, street].filter(Boolean).join(' ') || undefined
  const city = t['addr:city']
  const state = t['addr:state']
  const zip = t['addr:postcode']
  const address = [line1, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(', ') || undefined
  return { address, street: line1, city, state, zip }
}

/** Map one Overpass element to our Prospect. Pure (no env/IO) so it can be
 *  unit-tested against a captured Overpass response. `center` is the search
 *  anchor, used to compute distance. Building size comes from the footprint
 *  polygon (× storeys when tagged). Returns null when the element has no usable
 *  location. */
export function normalizeOsmElement(el: OverpassElement, center: { lat: number; lng: number }): Prospect | null {
  const t = el.tags ?? {}
  const lat = el.center?.lat ?? el.geometry?.[0]?.lat
  const lng = el.center?.lon ?? el.geometry?.[0]?.lon
  if (lat == null || lng == null) return null

  const id = `osm_${el.type}_${el.id}`
  const { address, street, city, state, zip } = osmAddress(t)
  // OSM has no legal owner; the business name/operator/brand is the occupant —
  // a useful label until the parcel enrichment fills the assessed owner (which,
  // for the free Oakland County layer, is itself withheld).
  const occupant = t.name ?? t.operator ?? t.brand

  // Footprint × storeys → gross building size. Most warehouses are single-storey,
  // so the footprint alone is already a good proxy; `building:levels` refines it.
  const footprint = footprintSqft(el.geometry)
  const levels = numTag(t['building:levels'])
  const buildingSqft = footprint > 0 ? Math.round(footprint * (levels && levels > 1 ? levels : 1)) : undefined

  const distance = milesBetween(center.lat, center.lng, lat, lng)
  const yearBuilt = numTag(t.start_date) ?? numTag(t['building:year'])

  return {
    _id: id,
    attom_id: id, // natural dedupe key (kept named attom_id for storage compatibility)
    address: address ?? occupant ?? `${city ?? 'Unknown'} warehouse`,
    street,
    city,
    state,
    zip,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    building_sqft: buildingSqft,
    year_built: yearBuilt,
    property_type: (t.building ?? 'warehouse').toUpperCase(),
    property_use: t.industrial ?? t.warehouse ?? 'Industrial / Warehouse',
    owner: occupant,
    distance_miles: Number(distance.toFixed(1)),
    source: 'osm',
    created_at: new Date().toISOString(),
  }
}

/** Build the Overpass QL for warehouse/industrial buildings within `radiusMiles`
 *  of a point. Exported for testing. */
export function buildOverpassQuery(q: ProspectQuery, maxResults: number): string {
  const radiusM = Math.round(q.radiusMiles * 1609.34)
  const around = `(around:${radiusM},${q.lat},${q.lng})`
  // Buildings only (not landuse polygons — those are land areas, not structures,
  // and would wreck the footprint-size estimate).
  return [
    '[out:json][timeout:30];',
    '(',
    `  way["building"="warehouse"]${around};`,
    `  way["building"="industrial"]${around};`,
    `  relation["building"="warehouse"]${around};`,
    `  relation["building"="industrial"]${around};`,
    ');',
    `out geom ${maxResults};`,
  ].join('\n')
}

/** Fetch warehouse prospects from OpenStreetMap. Throws a descriptive error on a
 *  transport/HTTP failure so the Prospects page can surface it. */
export async function fetchOsmWarehouses(q: ProspectQuery, maxResults = 200): Promise<Prospect[]> {
  const url = (env.OVERPASS_API_URL || DEFAULT_OVERPASS).trim()
  const body = buildOverpassQuery(q, maxResults)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, Accept: 'application/json' },
    body: `data=${encodeURIComponent(body)}`,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Overpass ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  const data = (await res.json()) as { elements?: OverpassElement[] }
  const elements = Array.isArray(data?.elements) ? data.elements : []

  const center = { lat: q.lat, lng: q.lng }
  const byId = new Map<string, Prospect>()
  for (const el of elements) {
    const p = normalizeOsmElement(el, center)
    if (!p) continue
    // Hard requirements (mirrors the old ATTOM client): inside the radius, and —
    // when we know the size — inside the size window. Unknown size never excludes.
    if (p.distance_miles != null && p.distance_miles > q.radiusMiles) continue
    if (p.building_sqft != null && (p.building_sqft < q.minSqft || p.building_sqft > q.maxSqft)) continue
    byId.set(p.attom_id, p)
  }
  return [...byId.values()].sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0))
}
