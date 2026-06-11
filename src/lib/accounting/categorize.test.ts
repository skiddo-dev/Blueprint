import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { categoryAccounts, sanitizeSuggestions, buildPayeeHistory, type CategoryLine } from './categorize'
import { DEFAULT_CHART_OF_ACCOUNTS } from './coa'
import type { Account, Bill, JournalEntry } from './types'

const ACCOUNTS = DEFAULT_CHART_OF_ACCOUNTS

const OUT: CategoryLine = { date: '2026-06-03', description: 'SUNOCO 0419 TROY MI', amount: -4_500 }
const IN: CategoryLine = { date: '2026-06-04', description: 'DEPOSIT — KROGER CO', amount: 250_000 }

describe('categoryAccounts', () => {
  it('splits active accounts into expense and income; other types excluded', () => {
    const { expense, income } = categoryAccounts(ACCOUNTS)
    expect(expense.every((a) => a.type === 'expense')).toBe(true)
    expect(income.every((a) => a.type === 'income')).toBe(true)
    expect(expense.map((a) => a.code)).toContain('6130') // Vehicle & Fuel
    expect(income.map((a) => a.code)).toContain('4000') // Contract Revenue
  })

  it('drops inactive accounts', () => {
    const withInactive: Account[] = ACCOUNTS.map((a) => (a.code === '6130' ? { ...a, active: false } : a))
    const { expense } = categoryAccounts(withInactive)
    expect(expense.map((a) => a.code)).not.toContain('6130')
  })
})

describe('sanitizeSuggestions', () => {
  const lines = [OUT, IN]

  it('keeps valid suggestions and sorts by index', () => {
    const out = sanitizeSuggestions(
      [
        { index: 1, account_id: '4000', confidence: 0.9, reason: 'customer deposit' },
        { index: 0, account_id: '6130', confidence: 0.85, reason: 'fuel merchant' },
      ],
      lines,
      ACCOUNTS,
    )
    expect(out.map((s) => s.index)).toEqual([0, 1])
    expect(out[0].account_id).toBe('6130')
    expect(out[1].account_id).toBe('4000')
  })

  it('nulls an account whose direction does not match the money flow', () => {
    const out = sanitizeSuggestions(
      [
        { index: 0, account_id: '4000', confidence: 0.9, reason: 'income on a withdrawal??' },
        { index: 1, account_id: '6130', confidence: 0.9, reason: 'expense on a deposit??' },
      ],
      lines,
      ACCOUNTS,
    )
    expect(out[0].account_id).toBeNull()
    expect(out[1].account_id).toBeNull()
    expect(out[0].confidence).toBe(0)
  })

  it('nulls unknown accounts, clamps confidence, drops bad indexes and duplicates', () => {
    const out = sanitizeSuggestions(
      [
        { index: 0, account_id: '9999', confidence: 7, reason: 'x'.repeat(300) },
        { index: 0, account_id: '6130', confidence: 0.5, reason: 'dup index — dropped' },
        { index: 5, account_id: '6130', confidence: 0.5, reason: 'out of range' },
        { index: -1, account_id: '6130', confidence: 0.5, reason: 'negative' },
        'not-an-object',
      ],
      lines,
      ACCOUNTS,
    )
    expect(out).toHaveLength(1)
    expect(out[0].account_id).toBeNull()
    expect(out[0].reason).toHaveLength(120)
  })

  it('tolerates a non-array payload', () => {
    expect(sanitizeSuggestions(undefined, lines, ACCOUNTS)).toEqual([])
    expect(sanitizeSuggestions({ nope: true }, lines, ACCOUNTS)).toEqual([])
  })
})

describe('buildPayeeHistory', () => {
  const bills = [
    {
      vendor_name: 'Acme Supply',
      status: 'open',
      lines: [
        { account_id: '5000', description: '', amount: cents(1) },
        { account_id: '5000', description: '', amount: cents(1) },
      ],
    },
    { vendor_name: 'Acme Supply', status: 'void', lines: [{ account_id: '6140', description: '', amount: cents(1) }] },
  ] as unknown as Pick<Bill, 'vendor_name' | 'lines' | 'status'>[]

  const expenses = [
    {
      memo: 'Sunoco — fuel run',
      source: 'expense',
      status: 'posted',
      lines: [
        { account_id: '6130', debit: cents(4_500), credit: cents(0) },
        { account_id: '1000', debit: cents(0), credit: cents(4_500) },
      ],
    },
    {
      memo: 'Sunoco — fuel again',
      source: 'expense',
      status: 'posted',
      lines: [
        { account_id: '6130', debit: cents(3_000), credit: cents(0) },
        { account_id: '1000', debit: cents(0), credit: cents(3_000) },
      ],
    },
  ] as unknown as Pick<JournalEntry, 'memo' | 'lines' | 'source' | 'status'>[]

  it('counts bill lines per vendor and expense debits per memo payee; void bills excluded', () => {
    const rows = buildPayeeHistory(bills, expenses)
    expect(rows).toContainEqual({ payee: 'acme supply', account_id: '5000', count: 2 })
    expect(rows).toContainEqual({ payee: 'sunoco', account_id: '6130', count: 2 })
    expect(rows.find((r) => r.account_id === '6140')).toBeUndefined()
  })

  it('sorts most-used first and respects the cap', () => {
    const rows = buildPayeeHistory(bills, expenses, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(2)
  })
})
