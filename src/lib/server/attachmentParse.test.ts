import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK so parsing never makes a network call (same pattern as
// llm.test.ts — the mocked client backs the shared getClient() in openai.ts).
const createMock = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { extractText, parseAttachmentWithLLM, parseImageAttachmentWithLLM, imageMime, analyzeAttachment } from './attachmentParse'

beforeEach(() => {
  createMock.mockReset()
})

const EMPTY = { doc_type: null, po: null, amount: null, store_numbers: [], summary: '', pertinent: false, confidence: 0 }

const modelReply = (fields: Record<string, unknown>) => ({
  choices: [{ message: { content: JSON.stringify({
    doc_type: null, po: null, amount: null, store_numbers: [], summary: '', pertinent: false, confidence: 0, ...fields,
  }) } }],
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
    createMock.mockResolvedValue(modelReply({
      doc_type: 'Purchase Order',
      po: '4471',
      amount: '$12,300.00',
      store_numbers: ['D-412', '118'],
      summary: 'PO for cooler repair.',
      pertinent: true,
      confidence: 0.95,
    }))

    const result = await parseAttachmentWithLLM('PURCHASE ORDER ... PO 4471 ... $12,300.00', 'PO_4471.pdf')

    expect(result.doc_type).toBe('Purchase Order')
    expect(result.po).toBe('4471')
    expect(result.amount).toBe('$12,300.00')
    expect(result.store_numbers).toEqual(['118', '412'])
    expect(result.pertinent).toBe(true)
    expect(result.confidence).toBe(0.95)
  })

  it('treats a missing/non-boolean pertinent as false', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ doc_type: 'Other', po: null, amount: null, store_numbers: [], summary: 's', confidence: 0.5 }) } }],
    })
    expect((await parseAttachmentWithLLM('text', 'f.txt')).pertinent).toBe(false)
  })

  it('skips the model call and returns empty for blank text', async () => {
    const result = await parseAttachmentWithLLM('   ', 'blank.txt')
    expect(createMock).not.toHaveBeenCalled()
    expect(result).toEqual(EMPTY)
  })

  it('degrades gracefully when the API throws', async () => {
    createMock.mockRejectedValue(new Error('network down'))
    const result = await parseAttachmentWithLLM('some text', 'doc.pdf')
    expect(result).toEqual(EMPTY)
  })
})

describe('imageMime — vision type gating', () => {
  it('detects by extension and by content-type', () => {
    expect(imageMime('Scan_20260608_4.png', undefined)).toBe('image/png')
    expect(imageMime('photo.JPG', undefined)).toBe('image/jpeg')
    expect(imageMime('attachment', 'image/jpeg; charset=binary')).toBe('image/jpeg')
  })

  it('rejects non-image types', () => {
    expect(imageMime('doc.pdf', 'application/pdf')).toBeNull()
    expect(imageMime('archive.zip', 'application/zip')).toBeNull()
  })
})

describe('parseImageAttachmentWithLLM', () => {
  it('sends the image as a base64 data URL and maps the reply', async () => {
    createMock.mockResolvedValue(modelReply({
      doc_type: 'Purchase Order', po: '7710', summary: 'Scanned PO for shelving.', pertinent: true, confidence: 0.8,
    }))

    const buf = Buffer.from('fake-png-bytes')
    const result = await parseImageAttachmentWithLLM(buf, 'image/png', 'Scan_4.png')

    expect(result.po).toBe('7710')
    expect(result.pertinent).toBe(true)
    const content = createMock.mock.calls[0][0].messages[1].content
    expect(content[1].image_url.url).toBe(`data:image/png;base64,${buf.toString('base64')}`)
  })

  it('skips the model call for an empty buffer', async () => {
    expect(await parseImageAttachmentWithLLM(Buffer.alloc(0), 'image/png', 'empty.png')).toEqual(EMPTY)
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('analyzeAttachment — routing', () => {
  it('routes text-extractable files through the text path', async () => {
    createMock.mockResolvedValue(modelReply({ doc_type: 'Quote/Bid', pertinent: true, summary: 'Bid totals.' }))
    const result = await analyzeAttachment('bid.csv', 'text/csv', Buffer.from('store,amount\n412,$1,200'))
    expect(result?.doc_type).toBe('Quote/Bid')
    expect(typeof createMock.mock.calls[0][0].messages[1].content).toBe('string')
  })

  it('routes images through the vision path', async () => {
    createMock.mockResolvedValue(modelReply({ doc_type: 'Purchase Order', pertinent: true, summary: 'Scanned PO.' }))
    const result = await analyzeAttachment('Scan_4.png', 'image/png', Buffer.from('png-bytes'))
    expect(result?.doc_type).toBe('Purchase Order')
    expect(Array.isArray(createMock.mock.calls[0][0].messages[1].content)).toBe(true)
  })

  it('returns null (no model call) for unreadable types', async () => {
    expect(await analyzeAttachment('plans.zip', 'application/zip', Buffer.from('zip'))).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })
})
