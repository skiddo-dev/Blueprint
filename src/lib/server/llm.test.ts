import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK so the parser never makes a network call. The mocked client
// exposes chat.completions.create as a shared spy we reconfigure per test.
const createMock = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { parseEmailWithLLM } from './llm'

const EMAIL = {
  subject: 'D-412 refrigeration quote',
  from: 'vendor@example.com',
  date: '2026-01-10',
  body: 'Please quote the walk-in cooler repair at store 412.',
}

beforeEach(() => {
  createMock.mockReset()
})

describe('parseEmailWithLLM — success path', () => {
  it('maps the model JSON and normalizes store numbers', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              date: '2026-01-15',
              assigned_to: 'Bob',
              quote: '$12,300',
              quote_type: 'T&M',
              po: 'PO-4471',
              quote_status: 'Won',
              store_numbers: ['D-412', '118', 'not-a-number'],
              summary: 'Quote the walk-in cooler repair.',
              event: 'Customer approved; PO 4471 issued',
              confidence: 0.9,
              uncertain_fields: [],
            }),
          },
        },
      ],
    })

    const result = await parseEmailWithLLM(EMAIL, { assignees: ['Bob', 'Ben'] })

    expect(result.date).toBe('2026-01-15')
    expect(result.assigned_to).toBe('Bob')
    expect(result.quote).toBe('$12,300')
    expect(result.quote_type).toBe('T&M')
    expect(result.po).toBe('PO-4471')
    expect(result.quote_status).toBe('Won')
    // 'D-412' → '412', '118' kept, 'not-a-number' dropped, then sorted.
    expect(result.store_numbers).toEqual(['118', '412'])
    expect(result.summary).toBe('Quote the walk-in cooler repair.')
    expect(result.event).toBe('Customer approved; PO 4471 issued')
    expect(result.confidence).toBe(0.9)
    expect(result.uncertain_fields).toEqual([])
  })

  it('passes a PRIOR TASK STATE block to the model on a thread reply', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        date: null, assigned_to: null, quote: null, quote_type: null, po: '4471',
        quote_status: 'Won', store_numbers: [], summary: 'Approved.',
        event: 'Approved', confidence: 0.8, uncertain_fields: [],
      }) } }],
    })

    await parseEmailWithLLM(EMAIL, {
      assignees: ['Bob'],
      priorTask: { quote: '$12,300', quote_status: 'Sent', store_numbers: ['412'] },
    })

    const userMsg = createMock.mock.calls[0][0].messages[1].content as string
    expect(userMsg).toContain('PRIOR TASK STATE')
    expect(userMsg).toContain('$12,300')
  })

  it('clamps an over-long summary to 200 chars', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        date: null, assigned_to: null, quote: null, quote_type: null,
        store_numbers: [], summary: 'x'.repeat(500),
      }) } }],
    })

    const result = await parseEmailWithLLM(EMAIL)
    expect(result.summary).toHaveLength(200)
  })
})

describe('parseEmailWithLLM — graceful degradation (never blocks a sync)', () => {
  const FALLBACK_BODY = EMAIL.body.slice(0, 200)

  it('falls back when the API call throws', async () => {
    createMock.mockRejectedValue(new Error('network down'))

    const result = await parseEmailWithLLM(EMAIL)

    expect(result).toEqual({
      date: null,
      assigned_to: null,
      quote: null,
      quote_type: null,
      po: null,
      quote_status: null,
      store_numbers: [],
      summary: FALLBACK_BODY,
      event: '',
      confidence: 0,
      uncertain_fields: [],
    })
  })

  it('falls back when the model refuses', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { refusal: 'I cannot help with that.' } }],
    })

    const result = await parseEmailWithLLM(EMAIL)
    expect(result.assigned_to).toBeNull()
    expect(result.store_numbers).toEqual([])
    expect(result.summary).toBe(FALLBACK_BODY)
  })
})
