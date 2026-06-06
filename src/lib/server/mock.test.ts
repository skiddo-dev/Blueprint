import { describe, it, expect } from 'vitest'
import { generateMockTasks } from './mock'
import { KANBAN_STATUSES, QUOTE_TYPES } from '$lib/constants'

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
