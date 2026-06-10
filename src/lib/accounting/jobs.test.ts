import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { jobProfitability, UNASSIGNED } from './jobs'

describe('jobProfitability', () => {
  it('rolls revenue/costs/profit/margin per job, void docs excluded, unassigned pooled last', () => {
    const { rows, totals } = jobProfitability(
      [
        { job: 'Gym AV', total: cents(10000), status: 'paid' },
        { job: 'Gym AV', total: cents(5000), status: 'open' },
        { job: 'Lobby', total: cents(8000), status: 'partial' },
        { job: 'Lobby', total: cents(9999), status: 'void' }, // excluded
        { total: cents(1200), status: 'open' },               // unassigned
      ],
      [
        { job: 'Gym AV', total: cents(6000), status: 'paid' },
        { job: 'Nowhere Job', total: cents(700), status: 'open' }, // costs-only job
      ],
      [{ job: 'Gym AV', amount: cents(500) }, { amount: cents(50) }],
    )
    expect(rows.map((r) => r.job)).toEqual(['Gym AV', 'Lobby', 'Nowhere Job', UNASSIGNED])
    const gym = rows[0]
    expect(gym.revenue).toBe(15000)
    expect(gym.costs).toBe(6500)
    expect(gym.profit).toBe(8500)
    expect(gym.margin).toBeCloseTo(8500 / 15000)
    expect(rows[2].margin).toBeNull() // costs-only job has no margin
    expect(rows[3]).toMatchObject({ revenue: 1200, costs: 50 })
    expect(totals.revenue).toBe(24200)
    expect(totals.costs).toBe(7250)
    expect(totals.profit).toBe(16950)
  })
  it('empty inputs', () => {
    const { rows, totals } = jobProfitability([], [])
    expect(rows).toEqual([])
    expect(totals.profit).toBe(0)
    expect(totals.margin).toBeNull()
  })
})
