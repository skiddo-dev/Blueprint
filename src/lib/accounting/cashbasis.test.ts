import { describe, expect, it } from 'vitest'
import { cents, type Cents } from '$lib/money'
import type { Bill, BillPayment, Invoice, JournalEntry, JournalSource, Payment } from './types'
import { cashBasisEntries, balancesFromEntries, type CashBasisInputs } from './cashbasis'
import { entryTotals } from './ledger'

const C = (n: number) => cents(n)

function entry(id: string, source: JournalSource, date: string, lines: { a: string; d?: number; c?: number }[], extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    _id: id, date, period: date.slice(0, 7), source, status: 'posted',
    lines: lines.map((l) => ({ account_id: l.a, debit: C(l.d ?? 0), credit: C(l.c ?? 0) })),
    created_at: `${date}T00:00:00.000Z`, ...extra,
  } as JournalEntry
}

const payment = (id: string, invoice_id: string, amount: number, date: string): Payment =>
  ({ _id: id, invoice_id, amount: C(amount), date, created_at: '' }) as Payment
const billPayment = (id: string, bill_id: string, amount: number, date: string): BillPayment =>
  ({ _id: id, bill_id, amount: C(amount), date, created_at: '' }) as BillPayment

function inputs(partial: Partial<CashBasisInputs>): CashBasisInputs {
  return {
    entries: [], payments: [], billPayments: [],
    invoices: new Map(), bills: new Map(),
    ...partial,
  }
}

function balanceOf(entries: JournalEntry[], account: string, opts = {}): number {
  const b = balancesFromEntries(entries, opts).find((x) => x.account_id === account)
  return b ? b.debit - b.credit : 0
}

describe('cashBasisEntries', () => {
  it('drops accrual AR/AP entries and recognizes revenue at payment dates (partial payments)', () => {
    const i = inputs({
      entries: [
        entry('e-inv', 'invoice', '2026-01-10', [{ a: '1100', d: 50000 }, { a: '4000', c: 50000 }], { source_ref: 'inv1' }),
        entry('e-p1', 'payment', '2026-02-01', [{ a: '1000', d: 25000 }, { a: '1100', c: 25000 }], { source_ref: 'p1' }),
        entry('e-p2', 'payment', '2026-03-01', [{ a: '1000', d: 25000 }, { a: '1100', c: 25000 }], { source_ref: 'p2' }),
      ],
      payments: [payment('p1', 'inv1', 25000, '2026-02-01'), payment('p2', 'inv1', 25000, '2026-03-01')],
      invoices: new Map([['inv1', { subtotal: C(50000), tax: C(0), number: 1 }]]),
    })
    const out = cashBasisEntries(i)
    // January: no revenue. Feb + Mar: 250 each.
    expect(balanceOf(out, '4000', { to: '2026-01-31' })).toBe(0)
    expect(-balanceOf(out, '4000', { to: '2026-02-28' })).toBe(25000)
    expect(-balanceOf(out, '4000')).toBe(50000)
    // A/R never appears
    expect(balanceOf(out, '1100')).toBe(0)
    // every virtual entry balances
    for (const e of out) {
      const t = entryTotals(e.lines)
      expect(t.debit).toBe(t.credit)
    }
  })

  it('splits taxed payments revenue:tax pro-rata; credit memos contribute nothing; 4900 never appears', () => {
    // invoice $1,000 + $60 tax; credit memo $530; cash received $530
    const i = inputs({
      entries: [
        entry('e-inv', 'invoice', '2026-01-05', [{ a: '1100', d: 106000 }, { a: '4000', c: 100000 }, { a: '2200', c: 6000 }], { source_ref: 'inv1' }),
        entry('e-cm', 'credit-memo', '2026-01-20', [{ a: '4900', d: 50000 }, { a: '2200', d: 3000 }, { a: '1100', c: 53000 }], { source_ref: 'cm1' }),
        entry('e-p1', 'payment', '2026-02-10', [{ a: '1000', d: 53000 }, { a: '1100', c: 53000 }], { source_ref: 'p1' }),
      ],
      payments: [payment('p1', 'inv1', 53000, '2026-02-10')],
      invoices: new Map([['inv1', { subtotal: C(100000), tax: C(6000), number: 7 }]]),
    })
    const out = cashBasisEntries(i)
    expect(-balanceOf(out, '4000')).toBe(50000) // $500.00 revenue
    expect(-balanceOf(out, '2200')).toBe(3000)  // $30.00 tax
    expect(balanceOf(out, '4900')).toBe(0)      // contra never appears on cash basis
    expect(balanceOf(out, '1000')).toBe(53000)  // cash in = exactly what arrived
  })

  it('allocates bill payments across multi-line bills and skips reversed payments', () => {
    const i = inputs({
      entries: [
        entry('e-bill', 'bill', '2026-01-08', [{ a: '5000', d: 30000 }, { a: '5010', d: 10000 }, { a: '2000', c: 40000 }], { source_ref: 'b1' }),
        entry('e-bp1', 'bill-payment', '2026-02-15', [{ a: '2000', d: 20000 }, { a: '1000', c: 20000 }], { source_ref: 'bp1' }),
        // a reversed customer payment: must be skipped
        entry('e-p1', 'payment', '2026-02-16', [{ a: '1000', d: 9999 }, { a: '1100', c: 9999 }], { source_ref: 'p1', reversed_by: 'rev1' }),
      ],
      payments: [payment('p1', 'invX', 9999, '2026-02-16')],
      billPayments: [billPayment('bp1', 'b1', 20000, '2026-02-15')],
      bills: new Map([['b1', { number: 3, lines: [
        { account_id: '5000', description: 'materials', amount: C(30000) },
        { account_id: '5010', description: 'subs', amount: C(10000) },
      ] as Bill['lines'] }]]),
      invoices: new Map(),
    })
    const out = cashBasisEntries(i)
    // half the bill paid → expenses recognized 3:1
    expect(balanceOf(out, '5000')).toBe(15000)
    expect(balanceOf(out, '5010')).toBe(5000)
    expect(balanceOf(out, '2000')).toBe(0)   // A/P gone
    expect(-balanceOf(out, '1000')).toBe(20000) // cash out only the bill payment; reversed payment skipped
  })

  it('passes through manual/expense/deposit/remittance/closing and keeps the 1050 bank side', () => {
    const i = inputs({
      entries: [
        entry('e-exp', 'expense', '2026-01-03', [{ a: '6130', d: 4000 }, { a: '1000', c: 4000 }]),
        entry('e-man', 'manual', '2026-01-04', [{ a: '1000', d: 100000 }, { a: '3000', c: 100000 }]),
        entry('e-dep', 'deposit', '2026-02-02', [{ a: '1000', d: 12550 }, { a: '1050', c: 12550 }], { source_ref: 'dep1' }),
        entry('e-rem', 'sales-tax-remittance', '2026-02-03', [{ a: '2200', d: 6000 }, { a: '1000', c: 6000 }], { source_ref: 'rem1' }),
        entry('e-close', 'closing', '2026-12-31', [{ a: '4000', d: 1 }, { a: '3100', c: 1 }]),
        // payment that landed in 1050
        entry('e-p1', 'payment', '2026-02-01', [{ a: '1050', d: 12550 }, { a: '1100', c: 12550 }], { source_ref: 'p1' }),
      ],
      payments: [payment('p1', 'inv1', 12550, '2026-02-01')],
      invoices: new Map([['inv1', { subtotal: C(12550), tax: C(0), number: 9 }]]),
    })
    const out = cashBasisEntries(i)
    const ids = out.map((e) => e._id)
    expect(ids).toContain('e-exp')
    expect(ids).toContain('e-man')
    expect(ids).toContain('e-dep')
    expect(ids).toContain('e-rem')
    expect(ids).toContain('e-close')
    // the virtual payment keeps its real bank side: Dr 1050
    const vp = out.find((e) => e._id === 'cb:payment:p1')!
    expect(vp.lines[0]).toMatchObject({ account_id: '1050', debit: 12550 })
    // closing excluded when asked (cash-basis balance sheet)
    expect(balanceOf(out, '3100', { excludeClosing: true })).toBe(0)
    // whole virtual ledger balances
    const all = out.flatMap((e) => e.lines)
    expect(all.reduce((s, l) => s + l.debit, 0)).toBe(all.reduce((s, l) => s + l.credit, 0))
  })

  it('missing invoice ref → full payment recognized as revenue (no crash)', () => {
    const i = inputs({
      entries: [entry('e-p1', 'payment', '2026-02-01', [{ a: '1000', d: 5000 }, { a: '1100', c: 5000 }], { source_ref: 'p1' })],
      payments: [payment('p1', 'gone', 5000, '2026-02-01')],
    })
    const out = cashBasisEntries(i)
    expect(-balanceOf(out, '4000')).toBe(5000)
  })

  it('penny allocation across odd partial payments sums exactly to cash received', () => {
    // $100.01 invoice + 6% tax = $106.01 total; three odd partial payments
    const subtotal = 10001 as Cents
    const tax = 600 as Cents
    const pays = [3334, 3334, 3933] // = 10601
    const i = inputs({
      entries: pays.map((amt, n) =>
        entry(`e-p${n}`, 'payment', `2026-0${n + 1}-15`, [{ a: '1000', d: amt }, { a: '1100', c: amt }], { source_ref: `p${n}` })),
      payments: pays.map((amt, n) => payment(`p${n}`, 'inv1', amt, `2026-0${n + 1}-15`)),
      invoices: new Map([['inv1', { subtotal: C(subtotal), tax: C(tax), number: 2 }]]),
    })
    const out = cashBasisEntries(i)
    const rev = -balanceOf(out, '4000')
    const t = -balanceOf(out, '2200')
    expect(rev + t).toBe(10601) // never loses or mints a penny
    for (const e of out) {
      const tt = entryTotals(e.lines)
      expect(tt.debit).toBe(tt.credit)
    }
  })
})
