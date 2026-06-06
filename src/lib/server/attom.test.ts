import { describe, it, expect } from 'vitest'
import { milesBetween, destinationPoint } from '$lib/geo'
import { normalizeAttomProperty } from './attom'
import { generateMockProspects } from './mock'
import { PROSPECT_CENTER } from '$lib/constants'

const CENTER = { lat: PROSPECT_CENTER.lat, lng: PROSPECT_CENTER.lng }

describe('geo math', () => {
  it('milesBetween is ~0 for the same point', () => {
    expect(milesBetween(CENTER.lat, CENTER.lng, CENTER.lat, CENTER.lng)).toBeCloseTo(0, 5)
  })

  it('one degree of latitude is ~69 miles', () => {
    const d = milesBetween(42, -83, 43, -83)
    expect(d).toBeGreaterThan(68)
    expect(d).toBeLessThan(70)
  })

  it('destinationPoint lands the requested distance away', () => {
    const p = destinationPoint(CENTER.lat, CENTER.lng, 90, 20)
    expect(milesBetween(CENTER.lat, CENTER.lng, p.lat, p.lng)).toBeCloseTo(20, 1)
  })
})

describe('normalizeAttomProperty', () => {
  const sample = {
    identifier: { attomId: 12345 },
    address: { line1: '500 Commerce Dr', locality: 'Troy', countrySubd: 'MI', postal1: '48083' },
    location: { latitude: '42.6', longitude: '-83.15' },
    building: { size: { universalsize: '52000' } },
    summary: { proptype: 'WAREHOUSE', propsubtype: 'Industrial', yearbuilt: '1998' },
    lot: { lotsize1: '3.2' },
    assessment: {
      assessed: { assdttlvalue: '2100000' },
      market: { mktttlvalue: '2750000' },
      owner: { owner1: { fullname: 'Great Lakes Holdings LLC' } },
    },
    sale: { amount: { saleamt: '2400000' }, saleTransDate: '2019-05-01' },
  }

  it('maps nested ATTOM fields onto the flat Prospect shape', () => {
    const p = normalizeAttomProperty(sample, CENTER)
    expect(p._id).toBe('12345')
    expect(p.attom_id).toBe('12345')
    expect(p.city).toBe('Troy')
    expect(p.state).toBe('MI')
    expect(p.building_sqft).toBe(52000)
    expect(p.year_built).toBe(1998)
    expect(p.property_type).toBe('WAREHOUSE')
    expect(p.owner).toBe('Great Lakes Holdings LLC')
    expect(p.market_value).toBe(2750000)
    expect(p.last_sale_amount).toBe(2400000)
    expect(p.source).toBe('attom')
  })

  it('computes distance from center when ATTOM omits location.distance', () => {
    const p = normalizeAttomProperty(sample, CENTER)
    const expected = milesBetween(CENTER.lat, CENTER.lng, 42.6, -83.15)
    expect(p.distance_miles).toBeCloseTo(Number(expected.toFixed(1)), 1)
  })

  it('survives a record missing most blocks', () => {
    const p = normalizeAttomProperty({ identifier: { attomId: 9 }, address: { oneLine: '1 A St' } }, CENTER)
    expect(p.attom_id).toBe('9')
    expect(p.address).toBe('1 A St')
    expect(p.building_sqft).toBeUndefined()
    expect(p.distance_miles).toBeUndefined()
  })
})

describe('generateMockProspects', () => {
  const q = { lat: CENTER.lat, lng: CENTER.lng, radiusMiles: 30, minSqft: 45_000, maxSqft: 75_000, count: 20 }

  it('returns the requested count', () => {
    expect(generateMockProspects(q)).toHaveLength(20)
  })

  it('every prospect honors the size window and radius', () => {
    for (const p of generateMockProspects(q)) {
      expect(p.building_sqft).toBeGreaterThanOrEqual(q.minSqft)
      expect(p.building_sqft).toBeLessThanOrEqual(q.maxSqft)
      expect(p.distance_miles).toBeLessThanOrEqual(q.radiusMiles)
      expect(p.latitude).toBeTypeOf('number')
      expect(p.longitude).toBeTypeOf('number')
      expect(p.source).toBe('mock')
    }
  })

  it('is sorted nearest-first', () => {
    const ds = generateMockProspects(q).map(p => p.distance_miles ?? 0)
    expect(ds).toEqual([...ds].sort((a, b) => a - b))
  })
})
