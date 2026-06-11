import { describe, it, expect } from 'vitest'
import { normalizeRoute, describeRoute, routeHref } from './ask'

const TODAY = '2026-06-10'

describe('normalizeRoute', () => {
  it('passes through a fully-specified income statement and orders the range', () => {
    expect(normalizeRoute({ report: 'income_statement', from: '2026-05-01', to: '2026-05-31' }, TODAY)).toEqual({
      report: 'income_statement', from: '2026-05-01', to: '2026-05-31',
    })
    // Swapped range gets repaired, not rejected.
    expect(normalizeRoute({ report: 'income_statement', from: '2026-05-31', to: '2026-05-01' }, TODAY)).toEqual({
      report: 'income_statement', from: '2026-05-01', to: '2026-05-31',
    })
  })

  it('defaults missing dates to year-start → today and bad dates likewise', () => {
    expect(normalizeRoute({ report: 'income_statement', from: null, to: null }, TODAY)).toEqual({
      report: 'income_statement', from: '2026-01-01', to: '2026-06-10',
    })
    expect(normalizeRoute({ report: 'balance_sheet', asOf: 'yesterday' }, TODAY)).toEqual({
      report: 'balance_sheet', asOf: TODAY,
    })
  })

  it('register requires an account; year routes clamp the year', () => {
    expect(normalizeRoute({ report: 'register', account: '' }, TODAY)).toBeNull()
    expect(normalizeRoute({ report: 'register', account: '1000' }, TODAY)).toMatchObject({
      report: 'register', account: '1000', from: '2026-01-01', to: TODAY,
    })
    expect(normalizeRoute({ report: 'vendor_spend', year: 2025 }, TODAY)).toEqual({ report: 'vendor_spend', year: 2025 })
    expect(normalizeRoute({ report: 'vendor_spend', year: 9999 }, TODAY)).toEqual({ report: 'vendor_spend', year: 2100 })
    expect(normalizeRoute({ report: 'budget_vs_actual', year: null }, TODAY)).toEqual({ report: 'budget_vs_actual', year: 2026 })
  })

  it('parameterless reports come back bare; none/garbage become null', () => {
    expect(normalizeRoute({ report: 'ar_aging' }, TODAY)).toEqual({ report: 'ar_aging' })
    expect(normalizeRoute({ report: 'cash', from: '2026-01-01' }, TODAY)).toEqual({ report: 'cash' })
    expect(normalizeRoute({ report: 'none' }, TODAY)).toBeNull()
    expect(normalizeRoute({ report: 'payroll' }, TODAY)).toBeNull()
    expect(normalizeRoute('income_statement', TODAY)).toBeNull()
    expect(normalizeRoute(null, TODAY)).toBeNull()
  })
})

describe('describeRoute / routeHref', () => {
  it('cites the report and its parameters', () => {
    expect(describeRoute({ report: 'income_statement', from: '2026-05-01', to: '2026-05-31' }))
      .toBe('Income statement · 2026-05-01 → 2026-05-31')
    expect(describeRoute({ report: 'balance_sheet', asOf: '2026-06-10' })).toBe('Balance sheet · as of 2026-06-10')
    expect(describeRoute({ report: 'register', account: '1000', from: '2026-01-01', to: '2026-06-10' }))
      .toBe('Account register · 1000 · 2026-01-01 → 2026-06-10')
    expect(describeRoute({ report: 'vendor_spend', year: 2026 })).toBe('Vendor spend · 2026')
    expect(describeRoute({ report: 'ap_aging' })).toBe('A/P aging')
  })

  it('links every route to its report page', () => {
    expect(routeHref({ report: 'register', account: '1000' })).toBe('/accounting/register/1000')
    expect(routeHref({ report: 'job_profit' })).toBe('/accounting/reports/jobs')
    expect(routeHref({ report: 'ar_aging' })).toBe('/accounting/aging')
    expect(routeHref({ report: 'budget_vs_actual', year: 2026 })).toBe('/accounting/reports/budget-vs-actual')
  })
})
