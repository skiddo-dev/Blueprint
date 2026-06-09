import { describe, it, expect } from 'vitest'
import { normalizeAzure } from './azure-costs'

describe('normalizeAzure', () => {
  const now = new Date('2026-06-15T00:00:00Z')
  // Month-to-date grouped by service (granularity None).
  const mtd = {
    columns: [{ name: 'Cost' }, { name: 'ServiceName' }, { name: 'Currency' }],
    rows: [
      [12.34, 'Azure Container Apps', 'USD'],
      [1.66, 'Azure Cosmos DB', 'USD'],
    ],
  }
  // Daily series for the trend (UsageDate is an int yyyymmdd).
  const daily = {
    columns: [{ name: 'Cost' }, { name: 'UsageDate' }, { name: 'Currency' }],
    rows: [
      [5.0, 20260510, 'USD'],
      [7.0, 20260512, 'USD'],
      [10.0, 20260601, 'USD'],
      [4.0, 20260605, 'USD'],
    ],
  }

  it('converts dollar floats to cents and sums MTD by service', () => {
    const p = normalizeAzure(mtd, daily, now)
    expect(p.provider).toBe('azure')
    expect(p.currency).toBe('USD')
    expect(p.monthToDateCents).toBe(1400) // 1234 + 166
    expect(p.breakdown).toEqual([
      { name: 'Azure Container Apps', amountCents: 1234 },
      { name: 'Azure Cosmos DB', amountCents: 166 },
    ])
  })

  it('rolls the daily series up to a monthly trend', () => {
    const p = normalizeAzure(mtd, daily, now)
    expect(p.trend).toEqual([
      { period: '2026-05', amountCents: 1200 }, // 500 + 700
      { period: '2026-06', amountCents: 1400 }, // 1000 + 400
    ])
    expect(p.lastFullMonthCents).toBe(1200)
  })

  it('tolerates a missing service column / empty tables', () => {
    const p = normalizeAzure({ columns: [], rows: [] }, { columns: [], rows: [] }, now)
    expect(p.monthToDateCents).toBe(0)
    expect(p.trend).toEqual([])
    expect(p.breakdown).toEqual([])
  })
})
