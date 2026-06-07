import { describe, it, expect } from 'vitest'
import { generateMockTasks, generateMockProspects } from './mock'
import { KANBAN_STATUSES, QUOTE_TYPES, PROSPECT_CENTER } from '$lib/constants'

// generateMockTasks backs USE_MOCK_DATA dev mode and the dashboard fixtures, so
// the dashboard's quote math depends on this shape staying intact.
describe('generateMockTasks', () => {
  it('honours the requested count and defaults to 35', () => {
    expect(generateMockTasks(5)).toHaveLength(5)
    expect(generateMockTasks()).toHaveLength(35)
  })

  it('produces tasks with valid, parseable fields', () => {
    for (const t of generateMockTasks(20)) {
      expect(t._id).toBe(t.id) // id must mirror _id for svelte-dnd-action
      expect(KANBAN_STATUSES).toContain(t.status)
      expect(QUOTE_TYPES).toContain(t.quote_type)
      expect(t.quote).toMatch(/^\$[\d,]+\.\d{2}$/)
      expect(Array.isArray(t.attachment_ids)).toBe(true)
      expect(Number.isNaN(new Date(t.date as string).getTime())).toBe(false)
    }
  })

  it('uses unique ids', () => {
    const ids = generateMockTasks(35).map(t => t._id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// generateMockProspects backs the Prospects page in USE_MOCK_DATA mode (and the
// "demo" pull when no live source is wanted).
describe('generateMockProspects', () => {
  const q = { lat: PROSPECT_CENTER.lat, lng: PROSPECT_CENTER.lng, radiusMiles: 30, minSqft: 45_000, maxSqft: 75_000, count: 20 }

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
