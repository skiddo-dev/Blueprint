import { describe, it, expect } from 'vitest'
import { cents, type Cents } from '$lib/money'
import { suggestPoMatch, type OpenPo } from './billScan'

let seq = 0
function po(over: Partial<OpenPo>): OpenPo {
  seq++
  return {
    _id: over._id ?? `po${seq}`,
    number: over.number ?? seq,
    year: 2026,
    vendor_name: 'Acme Supply',
    total: cents(100_000),
    billed: cents(0),
    status: 'open',
    ...over,
  }
}

const scan = (over: Partial<{ vendor: string | null; po: string | null; totalCents: Cents | null }>) => ({
  vendor: null, po: null, totalCents: null, ...over,
})

describe('suggestPoMatch', () => {
  it('matches an explicit PO reference, however the vendor formatted it', () => {
    const target = po({ _id: 'x', number: 3 })
    const other = po({ number: 9 })
    for (const ref of ['PO-2026-0003', 'PO 3', 'P.O. #0003', 'your order 2026-0003']) {
      const m = suggestPoMatch([other, target], scan({ po: ref }))
      expect(m?.po_id, ref).toBe('x')
      expect(m?.reason, ref).toBe('po-number')
    }
    expect(suggestPoMatch([other, target], scan({ po: 'PO-2026-0003' }))?.label).toBe('PO-2026-0003')
  })

  it('disambiguates a shared PO number by vendor; stays null when still ambiguous', () => {
    const a = po({ _id: 'a', number: 3, vendor_name: 'Acme Supply' })
    const b = po({ _id: 'b', number: 3, vendor_name: 'Crew Electric' })
    expect(suggestPoMatch([a, b], scan({ po: 'PO 3', vendor: 'ACME SUPPLY INC' }))?.po_id).toBe('a')
    expect(suggestPoMatch([a, b], scan({ po: 'PO 3' }))).toBeNull()
  })

  it('matches vendor + amount against the unbilled remainder (±1%)', () => {
    const a = po({ _id: 'a', total: cents(100_000), billed: cents(40_000) }) // 600.00 left
    const b = po({ _id: 'b', total: cents(500_000) })
    const m = suggestPoMatch([a, b], scan({ vendor: 'acme', totalCents: cents(60_100) })) // within 1%
    expect(m?.po_id).toBe('a')
    expect(m?.reason).toBe('vendor-amount')
    expect(m?.remaining).toBe(60_000)
  })

  it('falls back to vendor-only when exactly one open PO exists for them', () => {
    const a = po({ _id: 'a' })
    const m = suggestPoMatch([a], scan({ vendor: 'Acme' }))
    expect(m?.po_id).toBe('a')
    expect(m?.reason).toBe('vendor')
    // Two open POs for the vendor and no other signal → no guess.
    expect(suggestPoMatch([a, po({})], scan({ vendor: 'Acme' }))).toBeNull()
  })

  it('ignores closed/cancelled POs and unknown vendors', () => {
    const closed = po({ status: 'closed' })
    const cancelled = po({ status: 'cancelled' })
    expect(suggestPoMatch([closed, cancelled], scan({ vendor: 'Acme' }))).toBeNull()
    expect(suggestPoMatch([po({})], scan({ vendor: 'Totally Different Co' }))).toBeNull()
  })

  it('partially-billed POs still match', () => {
    const a = po({ _id: 'a', status: 'partially-billed', billed: cents(50_000) })
    expect(suggestPoMatch([a], scan({ vendor: 'Acme' }))?.po_id).toBe('a')
  })
})
