import { describe, it, expect } from 'vitest'
import { defaultFilters, anyFilterActive, activeFilterCount, taskMatchesFilters } from './boardFilters'
import type { Task } from './types'

const TODAY = '2026-06-10'

// Minimal task factory — only the fields the filters read.
const task = (over: Partial<Task> = {}): Task => ({
  _id: 't1', id: 't1', title: 'Fix freezer door', status: 'To Do',
  assigned_to: 'Ben', created_by: 'Bob', attachment_ids: [], created_at: '2026-06-01T00:00:00Z',
  ...over,
}) as Task

describe('defaultFilters / activity', () => {
  it('defaults are inactive and count zero', () => {
    const f = defaultFilters()
    expect(anyFilterActive(f)).toBe(false)
    expect(activeFilterCount(f)).toBe(0)
    expect(taskMatchesFilters(task(), f, TODAY)).toBe(true)
  })

  it('counts each clearable filter individually', () => {
    const f = { ...defaultFilters(), assignees: ['Ben', 'Kris'], stores: ['4112'], due: 'overdue' as const, text: 'x' }
    expect(anyFilterActive(f)).toBe(true)
    expect(activeFilterCount(f)).toBe(5)
  })
})

describe('assignee filter', () => {
  it('matches the primary assignee or any co-assignee', () => {
    const f = { ...defaultFilters(), assignees: ['Kris'] }
    expect(taskMatchesFilters(task({ assigned_to: 'Kris' }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ assigned_to: 'Ben', co_assignees: ['Kris'] }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ assigned_to: 'Ben' }), f, TODAY)).toBe(false)
  })

  it('multiple selections are OR-ed', () => {
    const f = { ...defaultFilters(), assignees: ['Kris', 'Ben'] }
    expect(taskMatchesFilters(task({ assigned_to: 'Ben' }), f, TODAY)).toBe(true)
  })
})

describe('store filter', () => {
  it('matches the extracted/stored store numbers, OR-ed', () => {
    const f = { ...defaultFilters(), stores: ['4112', '9999'] }
    expect(taskMatchesFilters(task({ store_numbers: ['4112'] }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ store_numbers: ['4257'] }), f, TODAY)).toBe(false)
  })

  it('falls back to store numbers in the title for legacy tasks', () => {
    const f = { ...defaultFilters(), stores: ['412'] }
    expect(taskMatchesFilters(task({ title: 'Store D-412 — fix freezer', store_numbers: undefined }), f, TODAY)).toBe(true)
  })
})

describe('due filter', () => {
  it('overdue = past-due AND still open (same rule as the card chip)', () => {
    const f = { ...defaultFilters(), due: 'overdue' as const }
    expect(taskMatchesFilters(task({ date: '2026-06-01' }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ date: '2026-06-01', status: 'Done' }), f, TODAY)).toBe(false)
    expect(taskMatchesFilters(task({ date: '2026-06-11' }), f, TODAY)).toBe(false)
    expect(taskMatchesFilters(task({ date: undefined }), f, TODAY)).toBe(false)
  })

  it('week = due today through +7 days, not already overdue', () => {
    const f = { ...defaultFilters(), due: 'week' as const }
    expect(taskMatchesFilters(task({ date: '2026-06-10' }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ date: '2026-06-17' }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ date: '2026-06-18' }), f, TODAY)).toBe(false)
    expect(taskMatchesFilters(task({ date: '2026-06-09' }), f, TODAY)).toBe(false)
  })

  it('none = no due date set', () => {
    const f = { ...defaultFilters(), due: 'none' as const }
    expect(taskMatchesFilters(task({ date: undefined }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ date: '2026-06-12' }), f, TODAY)).toBe(false)
  })
})

describe('quote filter', () => {
  it('matches the stage, treating an unset stage as Draft', () => {
    const f = { ...defaultFilters(), quote: 'Draft' as const }
    expect(taskMatchesFilters(task({ quote: '$5,000' }), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ quote: '$5,000', quote_status: 'Sent' }), f, TODAY)).toBe(false)
    expect(taskMatchesFilters(task(), f, TODAY)).toBe(false)
  })

  it("'none' matches only cards without a quote", () => {
    const f = { ...defaultFilters(), quote: 'none' as const }
    expect(taskMatchesFilters(task(), f, TODAY)).toBe(true)
    expect(taskMatchesFilters(task({ quote: '$5,000' }), f, TODAY)).toBe(false)
  })
})

describe('source filter', () => {
  it('email = synced from a flagged email; manual = created in-app', () => {
    const email = task({ exchange_id: 'AAMk123' })
    const manual = task()
    expect(taskMatchesFilters(email, { ...defaultFilters(), source: 'email' }, TODAY)).toBe(true)
    expect(taskMatchesFilters(manual, { ...defaultFilters(), source: 'email' }, TODAY)).toBe(false)
    expect(taskMatchesFilters(manual, { ...defaultFilters(), source: 'manual' }, TODAY)).toBe(true)
    expect(taskMatchesFilters(email, { ...defaultFilters(), source: 'manual' }, TODAY)).toBe(false)
  })
})

describe('text filter', () => {
  it('case-insensitive substring over title + description', () => {
    const t = task({ title: 'Freezer aisle remodel', description: 'Store wants new LED cases' })
    expect(taskMatchesFilters(t, { ...defaultFilters(), text: 'freezer' }, TODAY)).toBe(true)
    expect(taskMatchesFilters(t, { ...defaultFilters(), text: 'LED CASES' }, TODAY)).toBe(true)
    expect(taskMatchesFilters(t, { ...defaultFilters(), text: 'plumbing' }, TODAY)).toBe(false)
  })
})

describe('composition', () => {
  it('all active filters must pass (AND across filter kinds)', () => {
    const t = task({ assigned_to: 'Kris', store_numbers: ['4112'], date: '2026-06-01', quote: '$1', quote_status: 'Sent' })
    const f = { ...defaultFilters(), assignees: ['Kris'], stores: ['4112'], due: 'overdue' as const, quote: 'Sent' as const }
    expect(taskMatchesFilters(t, f, TODAY)).toBe(true)
    expect(taskMatchesFilters(t, { ...f, quote: 'Won' as const }, TODAY)).toBe(false)
    expect(taskMatchesFilters(t, { ...f, assignees: ['Ben'] }, TODAY)).toBe(false)
  })
})
