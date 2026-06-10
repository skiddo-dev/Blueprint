import { describe, expect, it } from 'vitest'
import { cents } from '$lib/money'
import { depositJournalLines, depositTotal } from './deposits'
import { isBalanced } from './ledger'
import { ACCT, paymentJournalLines } from './invoicing'

describe('deposits', () => {
  it('totals payments and builds a balanced Dr bank / Cr 1050 entry', () => {
    const total = depositTotal([{ amount: cents(10000) }, { amount: cents(2550) }])
    expect(total).toBe(12550)
    const lines = depositJournalLines(total, '1000')
    expect(isBalanced(lines)).toBe(true)
    expect(lines[0]).toMatchObject({ account_id: '1000', debit: 12550 })
    expect(lines[1]).toMatchObject({ account_id: ACCT.undeposited, credit: 12550 })
  })

  it('paymentJournalLines defaults to 1000 (legacy behavior) and accepts 1050', () => {
    expect(paymentJournalLines(cents(500))[0].account_id).toBe('1000')
    expect(paymentJournalLines(cents(500), ACCT.undeposited)[0].account_id).toBe('1050')
    expect(isBalanced(paymentJournalLines(cents(500), ACCT.undeposited))).toBe(true)
  })
})
