// Live prospect-source orchestrator for the Prospects page.
//
// Replaces the former paid ATTOM feed with a free hybrid: OpenStreetMap supplies
// warehouse locations + footprint-derived size (osm.ts), then Oakland County's
// public parcel GIS enriches each with assessed/taxable value + class (parcels.ts).
// No API key is required, so the page runs "live" out of the box; USE_MOCK_DATA
// still short-circuits to the generator for offline/demo use.
import { env } from '$env/dynamic/private'
import type { Prospect } from '$lib/types'
import { fetchOsmWarehouses, type ProspectQuery } from './osm'
import { enrichWithParcels } from './parcels'
import { generateMockProspects } from './mock'

export type { ProspectQuery } from './osm'

/** True when the page is serving live data (OpenStreetMap + county GIS). Unlike
 *  the old ATTOM key check this needs no secret — it's only false in mock mode.
 *  Surfaced in the UI so an admin knows whether results are real. */
export function hasLiveSource(): boolean {
  return env.USE_MOCK_DATA !== 'true'
}

/** Fetch warehouse prospects for the given query from the live hybrid source.
 *  Falls back to the mock generator when USE_MOCK_DATA=true. The OSM step is
 *  required (its failure surfaces to the caller); the parcel enrichment is
 *  best-effort and degrades to OSM-only data on failure. */
export async function fetchProspects(q: ProspectQuery): Promise<Prospect[]> {
  if (!hasLiveSource()) {
    return generateMockProspects({
      lat: q.lat,
      lng: q.lng,
      radiusMiles: q.radiusMiles,
      minSqft: q.minSqft,
      maxSqft: q.maxSqft,
    })
  }

  const warehouses = await fetchOsmWarehouses(q)
  const enriched = await enrichWithParcels(warehouses)
  return enriched.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0))
}
