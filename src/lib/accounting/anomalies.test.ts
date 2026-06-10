import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { findDuplicateBills, findVendorOutliers, findDuplicateExpenses, detectAnomalies } from './anomalies'
import type { Bill, JournalEntry } from './types'

// Minimal builders — only the fields the detectors read.
let seq = 0
function bill(over: Partial<Bill>): Bill {
  seq++
  return {
    _id: over._id ?? `b${seq}`,
    number: seq,
    year: 2026,
    vendor_id: 'v1',
    vendor_name: 'Acme Supply',
    bill_date: '2026-06-05',
    due_date: '2026-07-05',
    lines: [],
    total: cents(10_000),
    paid: cents(0),
    balance: cents(10_000),
    status: 'open',
    created_at: '2026-06-05T00:00:00Z',
    ...over,
  } as Bill
}

function expense(over: Partial<JournalEntry>): JournalEntry {
  seq++
  return {
    _id: over._id ?? `e${seq}`,
    date: '2026-06-05',
    period: '2026-06',
    memo: 'Fuel — Home Depot run',
    source: 'expense',
    lines: [
      { account_id: '6130', debit: cents(4_500), credit: cents(0) },
      { account_id: '1000', debit: cents(0), credit: cents(4_500) },
    ],
    status: 'posted',
    created_at: '2026-06-05T00:00:00Z',
    ...over,
  } as JournalEntry
}

describe('findDuplicateBills', () => {
  it('flags same vendor + same total within the window', () => {
    const a = bill({ _id: 'a', bill_date: '2026-06-03' })
    const b = bill({ _id: 'b', bill_date: '2026-06-07' })
    const out = findDuplicateBills([a, b], '2026-06')
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('duplicate-bill')
    expect(out[0].severity).toBe('warn')
    expect(out[0].refs.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(out[0].summary).toContain('Acme Supply')
    expect(out[0].summary).toContain('$100.00')
  })

  it('skips pairs whose vendor invoice numbers both exist and differ', () => {
    const a = bill({ bill_date: '2026-06-03', vendor_invoice_no: 'INV-1' })
    const b = bill({ bill_date: '2026-06-07', vendor_invoice_no: 'INV-2' })
    expect(findDuplicateBills([a, b], '2026-06')).toHaveLength(0)
  })

  it('still flags when the vendor invoice numbers match', () => {
    const a = bill({ bill_date: '2026-06-03', vendor_invoice_no: 'INV-9' })
    const b = bill({ bill_date: '2026-06-07', vendor_invoice_no: 'INV-9' })
    const out = findDuplicateBills([a, b], '2026-06')
    expect(out).toHaveLength(1)
    expect(out[0].summary).toContain('INV-9')
  })

  it('ignores pairs outside the window, different totals, void bills, and other months', () => {
    const a = bill({ bill_date: '2026-06-01' })
    const farApart = bill({ bill_date: '2026-06-28' })
    const differentTotal = bill({ bill_date: '2026-06-02', total: cents(20_000) })
    const voided = bill({ bill_date: '2026-06-02', status: 'void' })
    expect(findDuplicateBills([a, farApart, differentTotal, voided], '2026-06')).toHaveLength(0)
    // Both in May → nothing flagged for a June review.
    const m1 = bill({ bill_date: '2026-05-03' })
    const m2 = bill({ bill_date: '2026-05-05' })
    expect(findDuplicateBills([m1, m2], '2026-06')).toHaveLength(0)
  })
})

describe('findVendorOutliers', () => {
  const history = [
    bill({ bill_date: '2026-03-10', total: cents(50_000) }),
    bill({ bill_date: '2026-04-10', total: cents(55_000) }),
    bill({ bill_date: '2026-05-10', total: cents(60_000) }),
  ]

  it('flags a bill ≥3× the vendor median', () => {
    const big = bill({ _id: 'big', bill_date: '2026-06-10', total: cents(200_000) })
    const out = findVendorOutliers([...history, big], '2026-06')
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('vendor-outlier')
    expect(out[0].severity).toBe('info')
    expect(out[0].refs[0].id).toBe('big')
    expect(out[0].summary).toContain('$2,000.00')
    expect(out[0].summary).toContain('$550.00') // median of history
  })

  it('needs enough history and a real dollar delta', () => {
    const big = bill({ bill_date: '2026-06-10', total: cents(200_000) })
    // Only 2 prior bills → no flag.
    expect(findVendorOutliers([...history.slice(0, 2), big], '2026-06')).toHaveLength(0)
    // 3× median but tiny absolute delta → no flag.
    const smallHistory = [
      bill({ bill_date: '2026-03-10', total: cents(1_000) }),
      bill({ bill_date: '2026-04-10', total: cents(1_000) }),
      bill({ bill_date: '2026-05-10', total: cents(1_000) }),
    ]
    const smallSpike = bill({ bill_date: '2026-06-10', total: cents(4_000) })
    expect(findVendorOutliers([...smallHistory, smallSpike], '2026-06')).toHaveLength(0)
  })

  it('does not flag a normal-sized bill', () => {
    const normal = bill({ bill_date: '2026-06-10', total: cents(65_000) })
    expect(findVendorOutliers([...history, normal], '2026-06')).toHaveLength(0)
  })
})

describe('findDuplicateExpenses', () => {
  it('flags same memo + amount within the window', () => {
    const a = expense({ _id: 'x1', date: '2026-06-04' })
    const b = expense({ _id: 'x2', date: '2026-06-06' })
    const out = findDuplicateExpenses([a, b], '2026-06')
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('warn')
    expect(out[0].refs.map((r) => r.id)).toEqual(['x1', 'x2'])
    expect(out[0].summary).toContain('$45.00')
  })

  it('memo matching is case/space-insensitive; different memos do not pair', () => {
    const a = expense({ date: '2026-06-04', memo: 'Fuel — Home Depot run' })
    const b = expense({ date: '2026-06-06', memo: '  fuel — home depot RUN ' })
    expect(findDuplicateExpenses([a, b], '2026-06')).toHaveLength(1)
    const c = expense({ date: '2026-06-04', memo: 'Permit fee' })
    expect(findDuplicateExpenses([a, c], '2026-06')).toHaveLength(0)
  })

  it('ignores non-expense sources and pairs outside the window', () => {
    const a = expense({ date: '2026-06-04', source: 'manual' })
    const b = expense({ date: '2026-06-05', source: 'manual' })
    expect(findDuplicateExpenses([a, b], '2026-06')).toHaveLength(0)
    const far1 = expense({ date: '2026-06-01' })
    const far2 = expense({ date: '2026-06-20' })
    expect(findDuplicateExpenses([far1, far2], '2026-06')).toHaveLength(0)
  })
})

describe('detectAnomalies', () => {
  it('runs every detector and sorts warnings first', () => {
    const history = [
      bill({ bill_date: '2026-03-10', total: cents(50_000) }),
      bill({ bill_date: '2026-04-10', total: cents(55_000) }),
      bill({ bill_date: '2026-05-10', total: cents(60_000) }),
    ]
    const outlier = bill({ bill_date: '2026-06-10', total: cents(500_000) })
    const dup1 = expense({ date: '2026-06-04' })
    const dup2 = expense({ date: '2026-06-06' })
    const out = detectAnomalies({
      bills: [...history, outlier],
      expenseEntries: [dup1, dup2],
      month: '2026-06',
    })
    expect(out).toHaveLength(2)
    expect(out[0].severity).toBe('warn') // duplicate expense outranks the info outlier
    expect(out[1].kind).toBe('vendor-outlier')
  })
})
