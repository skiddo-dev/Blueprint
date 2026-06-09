import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { isBalanced } from './ledger'
import {
  ACCT, lineAmount, invoiceTotals, invoiceStatus, invoiceJournalLines, paymentJournalLines,
  daysBetween, agingBucket, buildAging, dueDate, AGING_BUCKETS,
} from './invoicing'

describe('lineAmount / invoiceTotals', () => {
  it('extends unit price by quantity', () => {
    expect(lineAmount({ description: 'x', quantity: 3, unit_price: cents(1000) })).toBe(3000)
    expect(lineAmount({ description: 'hrs', quantity: 2.5, unit_price: cents(8000) })).toBe(20000)
  })
  it('sums lines with no tax', () => {
    const t = invoiceTotals([
      { description: 'a', quantity: 1, unit_price: cents(10000) },
      { description: 'b', quantity: 2, unit_price: cents(2500) },
    ])
    expect(t.subtotal).toBe(15000)
    expect(t.tax).toBe(0)
    expect(t.total).toBe(15000)
  })
  it('applies a tax rate, rounding to the penny, with total = subtotal + tax', () => {
    const t = invoiceTotals([{ description: 'a', quantity: 1, unit_price: cents(10000) }], 6)
    expect(t.subtotal).toBe(10000)
    expect(t.tax).toBe(600)         // 6% of $100.00
    expect(t.total).toBe(10600)
    // A subtotal that doesn't divide evenly: 6% of $33.33 = $1.9998 → $2.00
    const t2 = invoiceTotals([{ description: 'a', quantity: 1, unit_price: cents(3333) }], 6)
    expect(t2.tax).toBe(200)
    expect(t2.total).toBe(t2.subtotal + t2.tax)
  })
})

describe('invoiceStatus', () => {
  it('maps paid amount to status', () => {
    expect(invoiceStatus(cents(10000), cents(0))).toBe('open')
    expect(invoiceStatus(cents(10000), cents(4000))).toBe('partial')
    expect(invoiceStatus(cents(10000), cents(10000))).toBe('paid')
    expect(invoiceStatus(cents(10000), cents(12000))).toBe('paid') // overpay still 'paid'
  })
})

describe('journal lines', () => {
  it('invoice with tax: Dr AR / Cr Revenue + Cr Sales Tax, balanced', () => {
    const lines = invoiceJournalLines({ total: cents(10600), subtotal: cents(10000), tax: cents(600) })
    expect(lines).toEqual([
      { account_id: ACCT.ar, debit: 10600, credit: 0 },
      { account_id: ACCT.revenue, debit: 0, credit: 10000 },
      { account_id: ACCT.salesTax, debit: 0, credit: 600 },
    ])
    expect(isBalanced(lines)).toBe(true)
  })
  it('invoice without tax: no Sales Tax line', () => {
    const lines = invoiceJournalLines({ total: cents(10000), subtotal: cents(10000), tax: cents(0) })
    expect(lines).toHaveLength(2)
    expect(isBalanced(lines)).toBe(true)
  })
  it('payment: Dr Cash / Cr AR, balanced', () => {
    const lines = paymentJournalLines(cents(5000))
    expect(lines).toEqual([
      { account_id: ACCT.cash, debit: 5000, credit: 0 },
      { account_id: ACCT.ar, debit: 0, credit: 5000 },
    ])
    expect(isBalanced(lines)).toBe(true)
  })
})

describe('daysBetween / dueDate', () => {
  it('counts whole days and crosses month boundaries', () => {
    expect(daysBetween('2026-06-01', '2026-06-30')).toBe(29)
    expect(daysBetween('2026-06-30', '2026-06-01')).toBe(-29)
    expect(dueDate('2026-06-09', 30)).toBe('2026-07-09')
    expect(dueDate('2026-01-31', 30)).toBe('2026-03-02') // Jan 31 + 30
  })
})

describe('agingBucket', () => {
  it('buckets by days past due (boundaries inclusive on the upper edge)', () => {
    expect(agingBucket('2026-06-30', '2026-06-09')).toBe('current') // not due yet
    expect(agingBucket('2026-06-09', '2026-06-09')).toBe('current') // due today
    expect(agingBucket('2026-06-09', '2026-06-10')).toBe('1-30')    // 1 day late
    expect(agingBucket('2026-06-09', '2026-07-09')).toBe('1-30')    // 30 days late
    expect(agingBucket('2026-06-09', '2026-07-10')).toBe('31-60')   // 31
    expect(agingBucket('2026-06-09', '2026-08-09')).toBe('61-90')   // 61
    expect(agingBucket('2026-06-09', '2026-09-30')).toBe('90+')
  })
})

describe('buildAging', () => {
  it('totals balances per bucket and overall', () => {
    const open = [
      { _id: 'a', number: 1, customer_name: 'Acme', due_date: '2026-06-30', balance: cents(10000) }, // current
      { _id: 'b', number: 2, customer_name: 'Acme', due_date: '2026-06-01', balance: cents(5000) },  // 1-30 (8 days late)
      { _id: 'c', number: 3, customer_name: 'Globex', due_date: '2026-03-01', balance: cents(2500) },// 90+
    ]
    const aging = buildAging(open, '2026-06-09')
    expect(aging.buckets.current).toBe(10000)
    expect(aging.buckets['1-30']).toBe(5000)
    expect(aging.buckets['90+']).toBe(2500)
    expect(aging.buckets['31-60']).toBe(0)
    expect(aging.total).toBe(17500)
    expect(aging.rows.find((r) => r._id === 'b')?.bucket).toBe('1-30')
  })
  it('is all-zero buckets for no open invoices', () => {
    const aging = buildAging([], '2026-06-09')
    expect(aging.total).toBe(0)
    expect(AGING_BUCKETS.every((b) => aging.buckets[b] === 0)).toBe(true)
  })
})
