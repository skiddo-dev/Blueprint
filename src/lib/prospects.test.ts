import { describe, it, expect } from 'vitest'
import {
  filterProspects, sizeHistogram, byCity, byDecade, distanceBands, byStatus, toCSV, statusOf,
  type ProspectFilters,
} from './prospects'
import { PROSPECT_STATUSES } from './constants'
import type { Prospect } from './types'

const p = (over: Partial<Prospect>): Prospect => ({
  _id: over.attom_id ?? 'x', attom_id: over.attom_id ?? 'x', address: '1 A St',
  source: 'mock', created_at: '2026-01-01', ...over,
})

const LIST: Prospect[] = [
  p({ attom_id: '1', address: '100 Commerce Dr, Troy', city: 'Troy', building_sqft: 46_000, year_built: 1995, distance_miles: 5, owner: 'Great Lakes Holdings LLC', pipeline_status: 'new' }),
  p({ attom_id: '2', address: '200 Industrial Row, Novi', city: 'Novi', building_sqft: 52_000, year_built: 2003, distance_miles: 18, owner: 'Oakland Properties LLC', pipeline_status: 'contacted' }),
  p({ attom_id: '3', address: '300 Logistics Way, Troy', city: 'Troy', building_sqft: 71_000, year_built: 1988, distance_miles: 25, owner: 'Midwest Realty Trust', pipeline_status: 'qualified' }),
  p({ attom_id: '4', address: '400 Enterprise Ct, Warren', city: 'Warren', building_sqft: 60_000, year_built: 2012, distance_miles: 28, owner: 'Summit Industrial LP' }), // no status → 'new'
]

const base: ProspectFilters = { search: '', city: '', status: 'all', minSqft: 0, maxSqft: 1e9, maxDistance: 1e9, minYear: 0, maxYear: 9999 }

describe('filterProspects', () => {
  it('returns all with a wide-open filter', () => {
    expect(filterProspects(LIST, base)).toHaveLength(4)
  })
  it('text search matches address / owner / city (case-insensitive)', () => {
    expect(filterProspects(LIST, { ...base, search: 'troy' }).map(x => x.attom_id)).toEqual(['1', '3'])
    expect(filterProspects(LIST, { ...base, search: 'summit' }).map(x => x.attom_id)).toEqual(['4'])
  })
  it('filters by city and status (treating missing status as new)', () => {
    expect(filterProspects(LIST, { ...base, city: 'Novi' })).toHaveLength(1)
    expect(filterProspects(LIST, { ...base, status: 'new' }).map(x => x.attom_id)).toEqual(['1', '4'])
  })
  it('filters by size, distance, and year ranges', () => {
    expect(filterProspects(LIST, { ...base, minSqft: 50_000, maxSqft: 65_000 }).map(x => x.attom_id)).toEqual(['2', '4'])
    expect(filterProspects(LIST, { ...base, maxDistance: 20 }).map(x => x.attom_id)).toEqual(['1', '2'])
    expect(filterProspects(LIST, { ...base, minYear: 2000, maxYear: 2099 }).map(x => x.attom_id)).toEqual(['2', '4'])
  })
})

describe('aggregations', () => {
  it('sizeHistogram buckets by 5k and is ascending', () => {
    const h = sizeHistogram(LIST, 5000)
    expect(h.map(b => b.label)).toEqual(['45k–50k', '50k–55k', '60k–65k', '70k–75k'])
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(4)
  })
  it('byCity counts busiest-first', () => {
    expect(byCity(LIST)[0]).toEqual({ label: 'Troy', count: 2 })
  })
  it('byDecade groups by decade built', () => {
    expect(byDecade(LIST).map(b => b.label)).toEqual(['1980s', '1990s', '2000s', '2010s'])
  })
  it('distanceBands groups into 10-mile bands', () => {
    expect(distanceBands(LIST, 10)).toEqual([
      { label: '0–10 mi', count: 1 }, { label: '10–20 mi', count: 1 }, { label: '20–30 mi', count: 2 },
    ])
  })
  it('byStatus is zero-filled for every stage', () => {
    const s = byStatus(LIST, PROSPECT_STATUSES)
    expect(s).toEqual({ new: 2, contacted: 1, qualified: 1, dead: 0 })
  })
})

describe('statusOf / toCSV', () => {
  it('statusOf defaults to new', () => {
    expect(statusOf(LIST[3])).toBe('new')
  })
  it('toCSV has a header + one row per prospect and escapes commas', () => {
    const csv = toCSV(LIST)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(5) // header + 4
    expect(lines[0]).toContain('Address')
    // owner names contain no commas, but addresses do → must be quoted
    expect(lines[1]).toContain('"100 Commerce Dr, Troy"')
  })
})
