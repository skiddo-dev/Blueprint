import { describe, it, expect } from 'vitest'
import { milesBetween, destinationPoint } from './geo'
import { PROSPECT_CENTER } from './constants'

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
