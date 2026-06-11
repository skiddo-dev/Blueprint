import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK so no test makes a network call (same pattern as
// llm.test.ts) — the mocked client exposes chat.completions.create as a spy.
const createMock = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { categorizeStatementLines } from './booksAi'
import { DEFAULT_CHART_OF_ACCOUNTS } from '$lib/accounting/coa'
import type { CategoryLine } from '$lib/accounting/categorize'

const LINES: CategoryLine[] = [
  { date: '2026-06-03', description: 'SUNOCO 0419 TROY MI', amount: -4_500 },
  { date: '2026-06-04', description: 'DEPOSIT — KROGER CO', amount: 250_000 },
]

function modelReply(payload: unknown) {
  createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(payload) } }] })
}

beforeEach(() => {
  createMock.mockReset()
})

describe('categorizeStatementLines', () => {
  it('maps model suggestions onto the lines and keeps only valid accounts', async () => {
    modelReply({
      suggestions: [
        { index: 0, account_id: '6130', confidence: 0.9, reason: 'fuel merchant' },
        { index: 1, account_id: '6130', confidence: 0.8, reason: 'wrong direction — should be nulled' },
      ],
    })
    const out = await categorizeStatementLines(LINES, DEFAULT_CHART_OF_ACCOUNTS, [])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ index: 0, account_id: '6130', confidence: 0.9 })
    expect(out[1].account_id).toBeNull() // expense account on a deposit
  })

  it('sends the payee history and the account catalog to the model', async () => {
    modelReply({ suggestions: [] })
    await categorizeStatementLines(LINES, DEFAULT_CHART_OF_ACCOUNTS, [
      { payee: 'sunoco', account_id: '6130', count: 7 },
    ])
    const call = createMock.mock.calls[0][0]
    const user = call.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(user).toContain('sunoco → 6130')
    expect(user).toContain('6130 Vehicle & Fuel')
    expect(user).toContain('OUT $45.00')
    expect(user).toContain('IN $2,500.00')
    // Strict structured outputs with the account enum constrained to the chart.
    expect(call.response_format.json_schema.strict).toBe(true)
    const accountEnum = call.response_format.json_schema.schema.properties.suggestions.items.properties.account_id.enum
    expect(accountEnum).toContain('6130')
    expect(accountEnum).toContain(null)
    expect(accountEnum).not.toContain('1000') // bank accounts are not categories
  })

  it('degrades to no suggestions when the model call fails', async () => {
    createMock.mockRejectedValue(new Error('boom'))
    await expect(categorizeStatementLines(LINES, DEFAULT_CHART_OF_ACCOUNTS, [])).resolves.toEqual([])
  })

  it('skips the call entirely for empty input', async () => {
    await expect(categorizeStatementLines([], DEFAULT_CHART_OF_ACCOUNTS, [])).resolves.toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })
})
