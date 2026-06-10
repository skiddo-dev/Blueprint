import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { generateInvoicePdf, generateBillPdf, generateQuotePdf } from './pdf'
import type { Invoice, Bill } from '$lib/accounting/types'

const invoice: Invoice = {
  _id: 'i1', number: 1, year: 2026, customer_id: 'c1', customer_name: 'Kroger #412',
  issue_date: '2026-06-09', due_date: '2026-07-09',
  lines: [{ description: 'Minor remodel', quantity: 1, unit_price: cents(500000), amount: cents(500000) }],
  subtotal: cents(500000), tax_rate: 6, tax: cents(30000), total: cents(530000),
  paid: cents(200000), balance: cents(330000), status: 'partial',
  created_at: '2026-06-09T00:00:00.000Z',
}

const bill: Bill = {
  _id: 'b1', number: 1, year: 2026, vendor_id: 'v1', vendor_name: 'ABC Drywall',
  bill_date: '2026-06-09', due_date: '2026-07-09',
  lines: [
    { account_id: '5000', description: 'Drywall materials', amount: cents(30000) },
    { account_id: '5010', description: 'Framing sub', amount: cents(120000) },
  ],
  total: cents(150000), paid: cents(50000), balance: cents(100000), status: 'partial',
  created_at: '2026-06-09T00:00:00.000Z',
}

// Smoke tests: the generators are mostly layout, so we assert a real, non-trivial
// PDF comes back (header + EOF marker). The money math they print is covered by
// the invoicing/payables unit tests.
describe('generateInvoicePdf', () => {
  it('produces a valid PDF buffer', async () => {
    const buf = await generateInvoicePdf(invoice)
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.subarray(-6).toString('latin1')).toContain('%%EOF')
    expect(buf.length).toBeGreaterThan(800)
  })
})

describe('generateBillPdf', () => {
  it('produces a valid PDF buffer', async () => {
    const buf = await generateBillPdf(bill)
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(800)
  })
})

describe('generateQuotePdf', () => {
  it('produces a valid PDF buffer with the show toggles set', async () => {
    const buf = await generateQuotePdf({
      customer: 'Kroger #412', date_received: '2026-06-09', bid_due_date: '2026-06-20',
      architect: 'Frank Crew', project_location: 'Store #412',
      description: 'Minor remodel of front-end registers', quote_type: 'Minor Remodel',
      labor: 3000, materials: 1500, total: 4500, show_labor: true, show_total: true,
    })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.subarray(-6).toString('latin1')).toContain('%%EOF')
    expect(buf.length).toBeGreaterThan(800)
  })

  it('renders with everything hidden (empty cost box)', async () => {
    const buf = await generateQuotePdf({
      customer: 'TBD', date_received: '2026-06-09', bid_due_date: '',
      architect: '', project_location: 'TBD', description: '', quote_type: '',
      labor: 0, materials: 0, total: 4500, show_labor: false, show_total: false,
    })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(800)
  })
})
