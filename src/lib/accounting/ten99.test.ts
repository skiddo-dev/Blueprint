import { describe, expect, it } from 'vitest'
import { cents } from '$lib/money'
import type { BillPayment, Vendor } from './types'
import { build1099Report, maskTaxId, TEN99_THRESHOLD } from './ten99'

const vendor = (id: string, name: string, is_1099: boolean, tax_id?: string): Vendor =>
  ({ _id: id, name, name_lower: name.toLowerCase(), is_1099, ...(tax_id ? { tax_id } : {}), created_at: '' }) as Vendor

const pay = (bill_id: string, amount: number, date: string): BillPayment =>
  ({ _id: crypto.randomUUID(), bill_id, amount: cents(amount), date, created_at: '' }) as BillPayment

const VENDORS = [vendor('v1', 'Frank Crew LLC', true, '12-3456789'), vendor('v2', 'Big Corp Supply', false)]
const BILLS = new Map([
  ['b1', { vendor_id: 'v1' }],
  ['b2', { vendor_id: 'v1' }],
  ['b3', { vendor_id: 'v2' }],
])

describe('build1099Report', () => {
  it('aggregates payments across multiple bills of one 1099 vendor, skips unflagged vendors', () => {
    const { rows, total } = build1099Report(
      [pay('b1', 40000, '2026-03-01'), pay('b2', 25000, '2026-07-15'), pay('b3', 90000, '2026-04-01')],
      BILLS, VENDORS, 2026,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ vendor_id: 'v1', total: 65000, paymentCount: 2, overThreshold: true })
    expect(total).toBe(65000)
  })

  it('threshold boundary: $599.99 is under, $600.00 is over', () => {
    const under = build1099Report([pay('b1', 59999, '2026-01-01')], BILLS, VENDORS, 2026)
    const over = build1099Report([pay('b1', TEN99_THRESHOLD, '2026-01-01')], BILLS, VENDORS, 2026)
    expect(under.rows[0].overThreshold).toBe(false)
    expect(over.rows[0].overThreshold).toBe(true)
  })

  it('filters strictly by calendar year', () => {
    const { rows } = build1099Report(
      [pay('b1', 100000, '2025-12-31'), pay('b1', 5000, '2026-01-01')],
      BILLS, VENDORS, 2026,
    )
    expect(rows[0].total).toBe(5000)
  })
})

describe('maskTaxId', () => {
  it('shows only the last four digits', () => {
    expect(maskTaxId('12-3456789')).toBe('***-**-6789')
    expect(maskTaxId('123-45-6789')).toBe('***-**-6789')
    expect(maskTaxId('12')).toBe('***')
  })
})
