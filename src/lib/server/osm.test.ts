import { describe, it, expect } from 'vitest'
import { footprintSqft, normalizeOsmElement, buildOverpassQuery, type OverpassElement } from './osm'
import { milesBetween } from '$lib/geo'
import { PROSPECT_CENTER } from '$lib/constants'

const CENTER = { lat: PROSPECT_CENTER.lat, lng: PROSPECT_CENTER.lng }

// A ~100m × 100m square (1 hectare ≈ 107,639 sqft) near Bloomfield Hills. One
// degree of latitude ≈ 111,320 m, so 100 m ≈ 0.000898°; longitude is scaled by
// cos(lat) so the ground footprint stays square.
const dLat = 100 / 111_320
const dLon = 100 / (111_320 * Math.cos((CENTER.lat * Math.PI) / 180))
const SQUARE = [
  { lat: CENTER.lat, lon: CENTER.lng },
  { lat: CENTER.lat + dLat, lon: CENTER.lng },
  { lat: CENTER.lat + dLat, lon: CENTER.lng + dLon },
  { lat: CENTER.lat, lon: CENTER.lng + dLon },
  { lat: CENTER.lat, lon: CENTER.lng }, // closing vertex (deduped by footprintSqft)
]

describe('footprintSqft', () => {
  it('computes ~1 hectare for a 100m square', () => {
    expect(footprintSqft(SQUARE)).toBeGreaterThan(105_000)
    expect(footprintSqft(SQUARE)).toBeLessThan(110_000)
  })

  it('returns 0 for a degenerate ring', () => {
    expect(footprintSqft(undefined)).toBe(0)
    expect(footprintSqft([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }])).toBe(0)
  })
})

describe('normalizeOsmElement', () => {
  const el: OverpassElement = {
    type: 'way',
    id: 70855110,
    tags: {
      building: 'warehouse',
      name: 'Frito-Lay',
      'addr:housenumber': '6600',
      'addr:street': '17 Mile Road',
      'addr:city': 'Sterling Heights',
      'addr:state': 'MI',
      'addr:postcode': '48314',
    },
    geometry: SQUARE,
  }

  it('maps tags + footprint onto the flat Prospect shape', () => {
    const p = normalizeOsmElement(el, CENTER)!
    expect(p).not.toBeNull()
    expect(p._id).toBe('osm_way_70855110')
    expect(p.attom_id).toBe('osm_way_70855110')
    expect(p.address).toContain('6600 17 Mile Road')
    expect(p.city).toBe('Sterling Heights')
    expect(p.owner).toBe('Frito-Lay') // business/occupant label (OSM has no legal owner)
    expect(p.property_type).toBe('WAREHOUSE')
    expect(p.building_sqft).toBeGreaterThan(100_000)
    expect(p.source).toBe('osm')
  })

  it('multiplies footprint by building:levels when tagged', () => {
    const oneStorey = normalizeOsmElement(el, CENTER)!.building_sqft!
    const twoStorey = normalizeOsmElement(
      { ...el, tags: { ...el.tags, 'building:levels': '2' } },
      CENTER,
    )!.building_sqft!
    expect(twoStorey).toBeCloseTo(oneStorey * 2, -3)
  })

  it('computes distance from the search center', () => {
    const p = normalizeOsmElement(el, CENTER)!
    const expected = milesBetween(CENTER.lat, CENTER.lng, el.geometry![0].lat, el.geometry![0].lon)
    expect(p.distance_miles).toBeCloseTo(Number(expected.toFixed(1)), 1)
  })

  it('falls back to center coords + occupant label when geometry/address are missing', () => {
    const p = normalizeOsmElement(
      { type: 'way', id: 9, tags: { building: 'warehouse', operator: 'Acme Logistics' }, center: { lat: 42.6, lon: -83.2 } },
      CENTER,
    )!
    expect(p.latitude).toBe(42.6)
    expect(p.owner).toBe('Acme Logistics')
    expect(p.building_sqft).toBeUndefined() // no geometry → no footprint
    expect(p.address).toBe('Acme Logistics')
  })

  it('returns null when an element has no location', () => {
    expect(normalizeOsmElement({ type: 'way', id: 1, tags: { building: 'warehouse' } }, CENTER)).toBeNull()
  })
})

describe('buildOverpassQuery', () => {
  it('targets warehouse/industrial buildings within the radius in metres', () => {
    const ql = buildOverpassQuery({ lat: 42.5, lng: -83.2, radiusMiles: 30, minSqft: 0, maxSqft: 1e9 }, 200)
    expect(ql).toContain('around:48280,42.5,-83.2') // 30 mi ≈ 48280 m
    expect(ql).toContain('"building"="warehouse"')
    expect(ql).toContain('"building"="industrial"')
    expect(ql).toContain('out geom 200;')
    expect(ql).not.toContain('landuse') // landuse polygons would wreck the size estimate
  })
})
