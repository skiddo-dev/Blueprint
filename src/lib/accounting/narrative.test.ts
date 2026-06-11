import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { buildMonthEndFacts, fallbackNarrative, monthLabel, prevMonth, monthBounds, type MonthEndInput } from './narrative'
import { incomeStatement, type Balance } from './statements'
import { DEFAULT_CHART_OF_ACCOUNTS } from './coa'
import type { Anomaly } from './anomalies'

const ACCOUNTS = DEFAULT_CHART_OF_ACCOUNTS

// June: $25,000 revenue, $8,000 materials (COGS), $2,000 rent → net $15,000.
const JUNE: Balance[] = [
  { account_id: '4000', debit: cents(0), credit: cents(2_500_000) },
  { account_id: '5000', debit: cents(800_000), credit: cents(0) },
  { account_id: '6100', debit: cents(200_000), credit: cents(0) },
]
// May: $20,000 revenue, $9,000 costs → net $11,000.
const MAY: Balance[] = [
  { account_id: '4000', debit: cents(0), credit: cents(2_000_000) },
  { account_id: '5000', debit: cents(700_000), credit: cents(0) },
  { account_id: '6100', debit: cents(200_000), credit: cents(0) },
]

function input(over: Partial<MonthEndInput> = {}): MonthEndInput {
  return {
    month: '2026-06',
    statement: incomeStatement(JUNE, ACCOUNTS),
    prevStatement: incomeStatement(MAY, ACCOUNTS),
    cashNet: cents(350_000),
    arTotal: cents(1_200_000),
    arOverdue: cents(300_000),
    apTotal: cents(450_000),
    budgetMonth: null,
    anomalies: [],
    ...over,
  }
}

describe('month helpers', () => {
  it('labels, previous month, and bounds — including year boundaries and leap years', () => {
    expect(monthLabel('2026-06')).toBe('June 2026')
    expect(prevMonth('2026-06')).toBe('2026-05')
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(monthBounds('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})

describe('buildMonthEndFacts', () => {
  it('formats every figure as dollars with a vs-previous-month note', () => {
    const facts = buildMonthEndFacts(input())
    expect(facts.label).toBe('June 2026')
    const fig = Object.fromEntries(facts.figures.map((f) => [f.label, f]))
    expect(fig['Revenue'].value).toBe('$25,000.00')
    expect(fig['Revenue'].note).toBe('up $5,000.00 vs May 2026 ($20,000.00)')
    expect(fig['Net income'].value).toBe('$15,000.00')
    expect(fig['Cash movement'].value).toBe('+$3,500.00')
    expect(fig['A/R outstanding'].note).toBe('$3,000.00 of it past due')
    expect(fig['Against budget']).toBeUndefined() // no budget supplied
  })

  it('ranks the top expense accounts and includes anomaly summaries in the prompt', () => {
    const anomaly: Anomaly = { kind: 'duplicate-bill', severity: 'warn', summary: 'Possible duplicate bill: …', refs: [] }
    const facts = buildMonthEndFacts(input({ anomalies: [anomaly] }))
    expect(facts.topExpenses[0]).toEqual({ name: 'Job Materials', amount: '$8,000.00' })
    expect(facts.promptLines.join('\n')).toContain('Review flags (1)')
    expect(facts.promptLines.join('\n')).toContain('Possible duplicate bill')
    // No-anomaly months say so explicitly, so the model doesn't invent flags.
    expect(buildMonthEndFacts(input()).promptLines.join('\n')).toContain('Review flags: none.')
  })

  it('adds the budget figure when a budget exists', () => {
    const facts = buildMonthEndFacts(input({ budgetMonth: { income: cents(2_200_000), expense: cents(1_200_000) } }))
    const budget = facts.figures.find((f) => f.label === 'Against budget')
    expect(budget?.value).toBe('revenue ahead $3,000.00')
    expect(budget?.note).toContain('spending under by $2,000.00')
  })
})

describe('fallbackNarrative', () => {
  it('writes a deterministic summary from the same facts', () => {
    const text = fallbackNarrative(buildMonthEndFacts(input()))
    expect(text).toContain('June 2026')
    expect(text).toContain('$25,000.00')
    expect(text).toContain('No review flags this month.')
  })

  it('counts review flags', () => {
    const anomaly: Anomaly = { kind: 'duplicate-bill', severity: 'warn', summary: 'x', refs: [] }
    const text = fallbackNarrative(buildMonthEndFacts(input({ anomalies: [anomaly, anomaly] })))
    expect(text).toContain('2 items need review before closing.')
  })
})
