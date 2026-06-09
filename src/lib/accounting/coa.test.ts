import { describe, it, expect } from 'vitest'
import { DEFAULT_CHART_OF_ACCOUNTS, expectedNormal } from './coa'

describe('DEFAULT_CHART_OF_ACCOUNTS', () => {
  it('has unique account codes', () => {
    const codes = DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('uses the code as the _id and is active by default', () => {
    for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
      expect(a._id).toBe(a.code)
      expect(a.active).toBe(true)
    }
  })

  it('gives every non-contra account its type-conventional normal balance', () => {
    for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
      if (a.contra) continue
      expect(a.normal, `${a.code} ${a.name}`).toBe(expectedNormal(a.type))
    }
  })

  it('flips the normal balance on every contra account', () => {
    const contras = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.contra)
    expect(contras.length).toBeGreaterThan(0)
    for (const a of contras) {
      expect(a.normal, `${a.code} ${a.name}`).not.toBe(expectedNormal(a.type))
    }
  })

  it('bands codes by type (1xxx asset, 2xxx liability, …)', () => {
    const band: Record<string, string> = { asset: '1', liability: '2', equity: '3', income: '4' }
    for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
      // expenses span 5xxx (COGS) and 6xxx (opex)
      if (a.type === 'expense') {
        expect(['5', '6'], `${a.code}`).toContain(a.code[0])
      } else {
        expect(a.code[0], `${a.code} ${a.name}`).toBe(band[a.type])
      }
    }
  })

  it('includes the accounts the Phase 2 AR flow will post to', () => {
    const codes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code))
    expect(codes).toContain('1000') // Cash — Operating
    expect(codes).toContain('1100') // Accounts Receivable
    expect(codes).toContain('2200') // Sales Tax Payable
    expect(codes).toContain('4000') // Contract Revenue
  })
})
