import { describe, it, expect } from 'vitest'
import { classLabel, applyParcelAttributes, type ParcelAttributes } from './parcels'
import type { Prospect } from '$lib/types'

const base: Prospect = {
  _id: 'osm_way_1',
  attom_id: 'osm_way_1',
  address: 'Frito-Lay',
  city: undefined,
  owner: 'Frito-Lay',
  property_use: 'Industrial / Warehouse',
  latitude: 42.5,
  longitude: -83.2,
  distance_miles: 5,
  source: 'osm',
  created_at: '2026-06-07T00:00:00.000Z',
}

describe('classLabel', () => {
  it('maps a MI class code to its family label', () => {
    expect(classLabel('201')).toBe('Commercial')
    expect(classLabel('301')).toBe('Industrial')
    expect(classLabel('401')).toBe('Residential')
  })

  it('returns undefined for empty/unknown codes', () => {
    expect(classLabel('')).toBeUndefined()
    expect(classLabel(null)).toBeUndefined()
    expect(classLabel('901')).toBeUndefined()
  })
})

describe('applyParcelAttributes', () => {
  it('fills assessed + derived market value and the class label', () => {
    const a: ParcelAttributes = { ASSESSEDVALUE: 1_359_040, TAXABLEVALUE: 1_200_000, CLASSCODE: '201' }
    const p = applyParcelAttributes(base, a)
    expect(p.assessed_value).toBe(1_359_040)
    expect(p.market_value).toBe(2_718_080) // assessed × 2 (MI SEV is 50% of true cash)
    expect(p.property_use).toBe('Commercial')
  })

  it('never clobbers the OSM occupant label with the withheld owner', () => {
    const p = applyParcelAttributes(base, { ASSESSEDVALUE: 500_000, CLASSCODE: '301' })
    expect(p.owner).toBe('Frito-Lay') // GIS owner is null → keep OSM occupant
  })

  it('adopts the county site address only when OSM had none', () => {
    const a: ParcelAttributes = { SITEADDRESS: '27000 TELEGRAPH RD', SITECITY: 'SOUTHFIELD', SITESTATE: 'MI', SITEZIP5: '48034' }
    const noAddr = applyParcelAttributes(base, a)
    expect(noAddr.address).toContain('27000 TELEGRAPH RD')
    expect(noAddr.city).toBe('SOUTHFIELD')

    const withOsmAddr = applyParcelAttributes({ ...base, street: '6600 17 Mile Rd', address: '6600 17 Mile Rd' }, a)
    expect(withOsmAddr.address).toBe('6600 17 Mile Rd') // OSM address wins
    expect(withOsmAddr.street).toBe('6600 17 Mile Rd')
  })

  it('ignores zero/negative assessment values', () => {
    const p = applyParcelAttributes(base, { ASSESSEDVALUE: 0 })
    expect(p.assessed_value).toBeUndefined()
    expect(p.market_value).toBeUndefined()
  })
})
