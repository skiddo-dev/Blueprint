import { describe, it, expect } from 'vitest'
import { searchTasks, searchQuotes, searchProspects, tokens } from './search'
import type { Task, Quote, Prospect } from './types'

const task = (over: Partial<Task>): Task => ({
  _id: 't1', id: 't1', title: 'Cooler repair', assigned_to: 'Ben',
  status: 'To Do', created_by: 'sys', attachment_ids: [], created_at: '2026-01-01', ...over,
})

const TASKS: Task[] = [
  task({ _id: 't1', title: 'Walk-in cooler repair', store_numbers: ['412'], assigned_to: 'Ben', po: '4471', created_at: '2026-01-03' }),
  task({ _id: 't2', title: 'Soffit paint', assigned_to: 'Kris', store_numbers: ['118'], created_at: '2026-01-02' }),
  task({ _id: 't3', title: 'Freezer install', assigned_to: 'Ben', store_numbers: ['412'], created_at: '2026-01-01' }),
]

describe('tokens', () => {
  it('splits, lowercases, trims', () => {
    expect(tokens('  Store  412 ')).toEqual(['store', '412'])
    expect(tokens('')).toEqual([])
  })
})

describe('searchTasks', () => {
  it('matches a store number', () => {
    expect(searchTasks(TASKS, '412').map(h => h.id).sort()).toEqual(['t1', 't3'])
  })
  it('matches an assignee', () => {
    expect(searchTasks(TASKS, 'kris').map(h => h.id)).toEqual(['t2'])
  })
  it('matches a PO', () => {
    expect(searchTasks(TASKS, '4471').map(h => h.id)).toEqual(['t1'])
  })
  it('is multi-token AND + case-insensitive', () => {
    expect(searchTasks(TASKS, 'COOLER 412').map(h => h.id)).toEqual(['t1'])
    expect(searchTasks(TASKS, 'cooler 999')).toEqual([])
  })
  it('deep-links to the board and carries a subtitle', () => {
    const hit = searchTasks(TASKS, '4471')[0]
    expect(hit.href).toBe('/?task=t1')
    expect(hit.type).toBe('task')
    expect(hit.subtitle).toContain('PO 4471')
  })
  it('returns [] for an empty query', () => {
    expect(searchTasks(TASKS, '   ')).toEqual([])
  })
})

describe('searchQuotes', () => {
  const quotes: Quote[] = [
    { _id: 'q1', year: 2026, store_number: '642', point_of_contact: 'Alex Edge', description: 'Minor Remodel', amount: 12000, source: 'imported', created_at: '2026-01-01' },
  ]
  it('matches contact / store / description', () => {
    expect(searchQuotes(quotes, 'alex').map(h => h.id)).toEqual(['q1'])
    expect(searchQuotes(quotes, '642').map(h => h.id)).toEqual(['q1'])
    expect(searchQuotes(quotes, 'remodel').map(h => h.id)).toEqual(['q1'])
    expect(searchQuotes(quotes, 'nope')).toEqual([])
  })
  it('deep-links to the dashboard quote tracker', () => {
    expect(searchQuotes(quotes, 'alex')[0].href).toBe('/dashboard?quote=q1')
  })
})

describe('searchProspects', () => {
  const prospects: Prospect[] = [
    { _id: 'p1', attom_id: 'p1', address: '123 Commerce Dr, Troy, MI', owner: 'Oakland Holdings LLC', city: 'Troy', source: 'mock', created_at: '2026-01-01' },
  ]
  it('matches address / owner / city', () => {
    expect(searchProspects(prospects, 'commerce').map(h => h.id)).toEqual(['p1'])
    expect(searchProspects(prospects, 'oakland').map(h => h.id)).toEqual(['p1'])
    expect(searchProspects(prospects, 'troy').map(h => h.id)).toEqual(['p1'])
    expect(searchProspects(prospects, 'detroit')).toEqual([])
  })
  it('deep-links to the prospect detail modal', () => {
    expect(searchProspects(prospects, 'commerce')[0].href).toBe('/prospects?prospect=p1')
  })
})
