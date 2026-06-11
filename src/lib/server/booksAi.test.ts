import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK so no test makes a network call (same pattern as
// llm.test.ts) — the mocked client exposes chat.completions.create as a spy.
const createMock = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { categorizeStatementLines, parseBillDocument } from './booksAi'
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

describe('parseBillDocument', () => {
  const INVOICE_TXT = Buffer.from(
    'ACME SUPPLY CO\nInvoice INV-2041\nDate: 2026-06-05\nRef: PO-2026-0003\n' +
      'Drywall sheets ........ $800.00\nDelivery ........ $50.00\nTOTAL DUE: $850.00\n',
    'utf8',
  )

  it('extracts a draft bill from a text invoice and keeps only chart accounts on lines', async () => {
    modelReply({
      vendor: 'Acme Supply Co',
      vendor_invoice_no: 'INV-2041',
      bill_date: '2026-06-05',
      po: 'PO-2026-0003',
      total: '$850.00',
      memo: 'Drywall sheets + delivery',
      lines: [
        { description: 'Drywall sheets', amount: '$800.00', account_id: '5000' },
        { description: 'Delivery', amount: '$50.00', account_id: 'not-an-account' },
      ],
      confidence: 0.9,
    })
    const out = await parseBillDocument('invoice.txt', 'text/plain', INVOICE_TXT, DEFAULT_CHART_OF_ACCOUNTS)
    expect(out).not.toBeNull()
    expect(out!.vendor).toBe('Acme Supply Co')
    expect(out!.vendor_invoice_no).toBe('INV-2041')
    expect(out!.bill_date).toBe('2026-06-05')
    expect(out!.lines).toHaveLength(2)
    expect(out!.lines[0].account_id).toBe('5000')
    expect(out!.lines[1].account_id).toBeNull() // unknown account sanitized away
    // The expense-account enum constrains line coding; bank accounts are not in it.
    const call = createMock.mock.calls[0][0]
    const accountEnum = call.response_format.json_schema.schema.properties.lines.items.properties.account_id.enum
    expect(accountEnum).toContain('5000')
    expect(accountEnum).not.toContain('1000')
  })

  it('returns null for unreadable file types without calling the model', async () => {
    const out = await parseBillDocument('invoice.docx', 'application/vnd.openxmlformats', Buffer.from('x'), DEFAULT_CHART_OF_ACCOUNTS)
    expect(out).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('degrades to the empty scan when the model fails; bad dates are dropped', async () => {
    createMock.mockRejectedValue(new Error('boom'))
    const out = await parseBillDocument('invoice.txt', 'text/plain', INVOICE_TXT, DEFAULT_CHART_OF_ACCOUNTS)
    expect(out).toMatchObject({ vendor: null, total: null, lines: [], confidence: 0 })

    createMock.mockReset()
    modelReply({
      vendor: 'Acme', vendor_invoice_no: null, bill_date: 'June 5th', po: null,
      total: '$10.00', memo: '', lines: [], confidence: 0.5,
    })
    const out2 = await parseBillDocument('invoice.txt', 'text/plain', INVOICE_TXT, DEFAULT_CHART_OF_ACCOUNTS)
    expect(out2!.bill_date).toBeNull()
  })
})
