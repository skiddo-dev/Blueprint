import { describe, it, expect } from 'vitest'
import { buildJobCockpit, jobMatchesStore, UNASSIGNED, type CockpitBooksInput } from './cockpit'

const noBooks: CockpitBooksInput = { invoices: [], bills: [], expenses: [] }

describe('jobMatchesStore', () => {
  it('matches an exact trimmed tag', () => {
    expect(jobMatchesStore('412', '412')).toBe(true)
    expect(jobMatchesStore(' 412 ', '412')).toBe(true)
  })
  it('matches a store as a whole digit-token inside a descriptive tag', () => {
    expect(jobMatchesStore('Store 412 — Kroger remodel', '412')).toBe(true)
    expect(jobMatchesStore('412 Roof', '412')).toBe(true)
  })
  it('does not match a store that is only a substring of a larger number', () => {
    expect(jobMatchesStore('4127', '412')).toBe(false)
  })
  it('is false for empty/missing tags', () => {
    expect(jobMatchesStore(undefined, '412')).toBe(false)
    expect(jobMatchesStore('', '412')).toBe(false)
  })
})

describe('buildJobCockpit — quotes', () => {
  it('splits quote amounts into contract/pipeline/lost (dollars → cents)', () => {
    const { rows } = buildJobCockpit({
      quotes: [
        { store_number: '412', amount: 1000, status: 'won' },
        { store_number: '412', amount: 500, status: 'open' },
        { store_number: '412', amount: 200, status: 'lost' },
      ],
      tasks: [],
      books: noBooks,
    })
    const r = rows.find((x) => x.store === '412')!
    expect(r.contract).toBe(100_000) // $1000 → cents
    expect(r.pipeline).toBe(50_000)
    expect(r.lost).toBe(20_000)
    expect(r.quoteCount).toBe(3)
  })

  it('treats unknown/missing quote status as pipeline (still in play)', () => {
    const { rows } = buildJobCockpit({
      quotes: [{ store_number: '7', amount: 10, status: null }],
      tasks: [], books: noBooks,
    })
    expect(rows[0].pipeline).toBe(1000)
    expect(rows[0].contract).toBe(0)
  })

  it('pools blank / N/A stores under Unassigned, sorted last', () => {
    const { rows } = buildJobCockpit({
      quotes: [
        { store_number: '', amount: 10, status: 'won' },
        { store_number: 'N/A', amount: 10, status: 'won' },
        { store_number: '412', amount: 999, status: 'won' },
      ],
      tasks: [], books: noBooks,
    })
    expect(rows[rows.length - 1].store).toBe(UNASSIGNED)
    expect(rows.find((r) => r.store === UNASSIGNED)!.contract).toBe(2000)
  })
})

describe('buildJobCockpit — cards', () => {
  it('counts open vs done and aggregates attachments + last activity', () => {
    const { rows } = buildJobCockpit({
      quotes: [],
      tasks: [
        { store_numbers: ['412'], status: 'In Progress', attachment_ids: ['a', 'b'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
        { store_numbers: ['412'], status: 'Done', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
        { store_numbers: ['412'], status: 'Cancelled', created_at: '2026-02-01T00:00:00Z' },
      ],
      books: noBooks,
    })
    const r = rows.find((x) => x.store === '412')!
    expect(r.cards).toBe(3)
    expect(r.openCards).toBe(1)
    expect(r.doneCards).toBe(2)
    expect(r.attachments).toBe(2)
    expect(r.lastActivity).toBe('2026-06-01T00:00:00Z') // most recent touch
    expect(r.byStatus['In Progress']).toBe(1)
  })

  it('counts a multi-store card under each of its stores', () => {
    const { rows } = buildJobCockpit({
      quotes: [],
      tasks: [{ store_numbers: ['412', '257'], status: 'To Do', created_at: '2026-01-01T00:00:00Z' }],
      books: noBooks,
    })
    expect(rows.find((r) => r.store === '412')!.cards).toBe(1)
    expect(rows.find((r) => r.store === '257')!.cards).toBe(1)
  })
})

describe('buildJobCockpit — books margin', () => {
  it('computes billed/cost/profit/margin and health from tagged books docs', () => {
    const { rows } = buildJobCockpit({
      quotes: [{ store_number: '412', amount: 1000, status: 'won' }],
      tasks: [],
      books: {
        invoices: [
          { job: 'Store 412 remodel', total: 100_000, status: 'sent' }, // $1000 billed
          { job: '412', total: 50_000, status: 'void' },                // void → ignored
        ],
        bills: [{ job: '412', total: 60_000, status: 'open' }],          // $600 cost
        expenses: [{ job: '412', amount: 10_000 }],                      // $100 cost
      },
    })
    const r = rows.find((x) => x.store === '412')!
    expect(r.billed).toBe(100_000)
    expect(r.cost).toBe(70_000)
    expect(r.profit).toBe(30_000)
    expect(r.margin).toBeCloseTo(0.3)
    expect(r.billedPctOfContract).toBeCloseTo(1.0)
    expect(r.health).toBe('profit')
  })

  it('flags a job that is losing money', () => {
    const { rows } = buildJobCockpit({
      quotes: [],
      tasks: [],
      books: { invoices: [{ job: '9', total: 1000, status: 'sent' }], bills: [{ job: '9', total: 4000, status: 'open' }], expenses: [] },
    })
    const r = rows.find((x) => x.store === '9')!
    expect(r.profit).toBe(-3000)
    expect(r.health).toBe('loss')
  })

  it('marks a job with quotes/cards but no billing as unbilled', () => {
    const { rows } = buildJobCockpit({
      quotes: [{ store_number: '412', amount: 1000, status: 'won' }],
      tasks: [{ store_numbers: ['412'], status: 'In Progress', created_at: '2026-01-01T00:00:00Z' }],
      books: noBooks,
    })
    const r = rows.find((x) => x.store === '412')!
    expect(r.billed).toBe(0)
    expect(r.margin).toBeNull()
    expect(r.health).toBe('unbilled')
  })

  it('gives a store-like books-only tag its own row', () => {
    const { rows } = buildJobCockpit({
      quotes: [],
      tasks: [],
      books: { invoices: [{ job: '888', total: 5000, status: 'sent' }], bills: [], expenses: [] },
    })
    expect(rows.find((r) => r.store === '888')).toBeTruthy()
  })

  it('pools a non-store-like books tag under Unassigned', () => {
    const { rows } = buildJobCockpit({
      quotes: [],
      tasks: [],
      books: { invoices: [{ job: 'General overhead', total: 5000, status: 'sent' }], bills: [], expenses: [] },
    })
    expect(rows.find((r) => r.store === UNASSIGNED)!.billed).toBe(5000)
  })
})

describe('buildJobCockpit — portfolio', () => {
  it('rolls up totals and counts real jobs (excludes Unassigned)', () => {
    const { portfolio } = buildJobCockpit({
      quotes: [
        { store_number: '412', amount: 1000, status: 'won' },
        { store_number: '257', amount: 500, status: 'open' },
        { store_number: '', amount: 99, status: 'won' },
      ],
      tasks: [{ store_numbers: ['412'], status: 'To Do', created_at: '2026-01-01T00:00:00Z' }],
      books: {
        invoices: [{ job: '412', total: 80_000, status: 'sent' }],
        bills: [{ job: '412', total: 50_000, status: 'open' }],
        expenses: [],
      },
    })
    expect(portfolio.jobs).toBe(2) // 412 + 257, not Unassigned
    expect(portfolio.contract).toBe(100_000 + 9_900) // both won quotes
    expect(portfolio.pipeline).toBe(50_000)
    expect(portfolio.billed).toBe(80_000)
    expect(portfolio.cost).toBe(50_000)
    expect(portfolio.profit).toBe(30_000)
    expect(portfolio.margin).toBeCloseTo(0.375)
    expect(portfolio.openCards).toBe(1)
  })
})
