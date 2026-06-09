import { describe, it, expect } from 'vitest'
import { normalizeAtlasInvoices } from './atlas-billing'

describe('normalizeAtlasInvoices', () => {
  const now = new Date('2026-06-15T00:00:00Z')
  const invoices = [
    {
      startDate: '2026-05-01T00:00:00Z',
      amountBilledCents: 5700,
      statusName: 'PAID',
      lineItems: [
        { sku: 'ATLAS_INSTANCE_M10', totalPriceCents: 5000 },
        { sku: 'ATLAS_BACKUP', totalPriceCents: 700 },
      ],
    },
    {
      startDate: '2026-06-01T00:00:00Z',
      amountBilledCents: 2100,
      statusName: 'PENDING',
      lineItems: [
        { sku: 'ATLAS_INSTANCE_M10', totalPriceCents: 1900 },
        { sku: 'ATLAS_DATA_TRANSFER', totalPriceCents: 200 },
      ],
    },
  ]

  it('uses cents directly (no float conversion) and buckets by start month', () => {
    const p = normalizeAtlasInvoices(invoices, now)
    expect(p.provider).toBe('atlas')
    expect(p.monthToDateCents).toBe(2100) // the in-progress (PENDING) June invoice
    expect(p.lastFullMonthCents).toBe(5700)
    expect(p.trend).toEqual([
      { period: '2026-05', amountCents: 5700 },
      { period: '2026-06', amountCents: 2100 },
    ])
  })

  it("breaks down the current month's invoice line items, largest first", () => {
    const p = normalizeAtlasInvoices(invoices, now)
    expect(p.breakdown).toEqual([
      { name: 'ATLAS_INSTANCE_M10', amountCents: 1900 },
      { name: 'ATLAS_DATA_TRANSFER', amountCents: 200 },
    ])
  })

  it('falls back to the latest invoice for breakdown when there is no current month', () => {
    const p = normalizeAtlasInvoices([invoices[0]], now)
    expect(p.monthToDateCents).toBe(0)
    expect(p.breakdown[0]).toEqual({ name: 'ATLAS_INSTANCE_M10', amountCents: 5000 })
  })
})
