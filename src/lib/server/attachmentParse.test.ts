import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK so parsing never makes a network call (same pattern as
// llm.test.ts — the mocked client backs the shared getClient() in openai.ts).
const createMock = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { extractText, parseAttachmentWithLLM } from './attachmentParse'

beforeEach(() => {
  createMock.mockReset()
})

describe('extractText — type gating', () => {
  it('decodes csv and txt by extension', async () => {
    expect(await extractText('bid.csv', 'text/csv', Buffer.from('store,amount\n412,$1,200'))).toContain('412')
    expect(await extractText('note.txt', 'text/plain', Buffer.from('hello world'))).toBe('hello world')
  })

  it('decodes by content-type even when the name lacks an extension', async () => {
    expect(await extractText('attachment', 'text/csv', Buffer.from('a,b'))).toBe('a,b')
  })

  it('returns null for unsupported types', async () => {
    expect(await extractText('photo.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
  })

  it('returns null for empty content', async () => {
    expect(await extractText('empty.csv', 'text/csv', Buffer.from('   '))).toBeNull()
  })
})

describe('parseAttachmentWithLLM', () => {
  it('maps the model JSON and normalizes store numbers', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        doc_type: 'Purchase Order',
        po: '4471',
        amount: '$12,300.00',
        store_numbers: ['D-412', '118'],
        summary: 'PO for cooler repair.',
        confidence: 0.95,
      }) } }],
    })

    const result = await parseAttachmentWithLLM('PURCHASE ORDER ... PO 4471 ... $12,300.00', 'PO_4471.pdf')

    expect(result.doc_type).toBe('Purchase Order')
    expect(result.po).toBe('4471')
    expect(result.amount).toBe('$12,300.00')
    expect(result.store_numbers).toEqual(['118', '412'])
    expect(result.confidence).toBe(0.95)
  })

  it('skips the model call and returns empty for blank text', async () => {
    const result = await parseAttachmentWithLLM('   ', 'blank.txt')
    expect(createMock).not.toHaveBeenCalled()
    expect(result).toEqual({ doc_type: null, po: null, amount: null, store_numbers: [], summary: '', confidence: 0 })
  })

  it('degrades gracefully when the API throws', async () => {
    createMock.mockRejectedValue(new Error('network down'))
    const result = await parseAttachmentWithLLM('some text', 'doc.pdf')
    expect(result).toEqual({ doc_type: null, po: null, amount: null, store_numbers: [], summary: '', confidence: 0 })
  })
})
