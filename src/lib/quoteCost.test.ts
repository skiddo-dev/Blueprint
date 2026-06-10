import { describe, it, expect } from 'vitest'
import { quoteCostRows } from './quoteCost'

describe('quoteCostRows', () => {
  it('shows a single Amount line by default', () => {
    expect(quoteCostRows({ labor: 0, materials: 0, total: 4500 }))
      .toEqual([['Amount:', 4500]])
  })

  it('legacy default: a provided breakdown implies show_labor', () => {
    expect(quoteCostRows({ labor: 3000, materials: 1500, total: 4500 }))
      .toEqual([['Labor:', 3000], ['Materials:', 1500], ['Total:', 4500]])
  })

  it('labor on + total on prints the full breakdown, labelled Total', () => {
    expect(quoteCostRows({ labor: 3000, materials: 1500, total: 4500, show_labor: true, show_total: true }))
      .toEqual([['Labor:', 3000], ['Materials:', 1500], ['Total:', 4500]])
  })

  it('omits the materials line when zero', () => {
    expect(quoteCostRows({ labor: 3000, materials: 0, total: 3000, show_labor: true, show_total: true }))
      .toEqual([['Labor:', 3000], ['Total:', 3000]])
  })

  it('labor only (total hidden)', () => {
    expect(quoteCostRows({ labor: 3000, materials: 0, total: 4500, show_labor: true, show_total: false }))
      .toEqual([['Labor:', 3000]])
  })

  it('total only, hiding a provided breakdown, labels it Amount', () => {
    expect(quoteCostRows({ labor: 3000, materials: 1500, total: 4500, show_labor: false, show_total: true }))
      .toEqual([['Amount:', 4500]])
  })

  it('both toggles off prints nothing', () => {
    expect(quoteCostRows({ labor: 3000, materials: 1500, total: 4500, show_labor: false, show_total: false }))
      .toEqual([])
  })
})
