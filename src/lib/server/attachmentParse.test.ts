import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK so parsing never makes a network call (same pattern as
// llm.test.ts — the mocked client backs the shared getClient() in openai.ts).
const createMock = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

// Mock pdf-parse so PDF tests drive getText()/getScreenshot() without real files:
// getText controls whether a PDF has a readable text layer, getScreenshot backs
// the scanned-PDF → vision rasterization path.
const getTextMock = vi.hoisted(() => vi.fn())
const getScreenshotMock = vi.hoisted(() => vi.fn())
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getText = getTextMock
    getScreenshot = getScreenshotMock
    destroy = vi.fn(async () => {})
  },
}))

import { extractText, parseAttachmentWithLLM, parseImageAttachmentWithLLM, imageMime, analyzeAttachment } from './attachmentParse'

beforeEach(() => {
  createMock.mockReset()
  getTextMock.mockReset().mockResolvedValue({ text: '' })
  getScreenshotMock.mockReset().mockResolvedValue({ pages: [], total: 0 })
})

const EMPTY = { doc_type: null, po: null, amount: null, vendor: null, doc_date: null, store_numbers: [], summary: '', pertinent: false, confidence: 0 }

const modelReply = (fields: Record<string, unknown>) => ({
  choices: [{ message: { content: JSON.stringify({
    doc_type: null, po: null, amount: null, vendor: null, doc_date: null, store_numbers: [], summary: '', pertinent: false, confidence: 0, ...fields,
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

describe('analyzeAttachment — scanned PDF vision fallback', () => {
  it('uses the text path when the PDF has a readable text layer', async () => {
    getTextMock.mockResolvedValue({ text: 'PURCHASE ORDER  PO 4471  $12,300.00' })
    createMock.mockResolvedValue(modelReply({ doc_type: 'Purchase Order', po: '4471', pertinent: true, summary: 'PO.' }))

    const result = await analyzeAttachment('po.pdf', 'application/pdf', Buffer.from('%PDF-1.7'))

    expect(result?.po).toBe('4471')
    // text path → string content; never rasterizes when there's a text layer
    expect(typeof createMock.mock.calls[0][0].messages[1].content).toBe('string')
    expect(getScreenshotMock).not.toHaveBeenCalled()
  })

  it('rasterizes a no-text-layer PDF (scanned contract) and reads it via vision', async () => {
    getTextMock.mockResolvedValue({ text: '   ' }) // signed/scanned contract — no text layer
    getScreenshotMock.mockResolvedValue({
      pages: [
        { dataUrl: 'data:image/png;base64,AAAA', pageNumber: 1 },
        { dataUrl: 'data:image/png;base64,BBBB', pageNumber: 2 },
      ],
      total: 2,
    })
    createMock.mockResolvedValue(modelReply({
      doc_type: 'Scope of Work', store_numbers: ['811'], pertinent: true, summary: 'Pharmacy contract for store 811.',
    }))

    const result = await analyzeAttachment('811 Contract.pdf', 'application/pdf', Buffer.from('%PDF-1.7'))

    expect(result?.doc_type).toBe('Scope of Work')
    expect(result?.store_numbers).toEqual(['811'])
    expect(getScreenshotMock).toHaveBeenCalledWith(expect.objectContaining({ first: 3 }))
    // vision path → array content carrying every rendered page image
    const content = createMock.mock.calls[0][0].messages[1].content
    expect(Array.isArray(content)).toBe(true)
    expect(content.filter((p: { type: string }) => p.type === 'image_url')).toHaveLength(2)
    expect(content[1].image_url.url).toBe('data:image/png;base64,AAAA')
  })

  it('treats a PDF whose only "text" is pdf-parse page markers as no text layer', async () => {
    // pdf-parse emits a synthetic page for an image-only PDF; even with markers
    // suppressed a scan can leave a few stray chars. Below PDF_MIN_TEXT we must
    // route to vision, not feed the model near-empty junk.
    getTextMock.mockResolvedValue({ text: '-- 1 of 1 --' })
    getScreenshotMock.mockResolvedValue({ pages: [{ dataUrl: 'data:image/png;base64,AAAA', pageNumber: 1 }], total: 1 })
    createMock.mockResolvedValue(modelReply({ doc_type: 'Invoice', pertinent: true, summary: 'Scanned invoice.' }))

    const result = await analyzeAttachment('scan.pdf', 'application/pdf', Buffer.from('%PDF'))

    expect(result?.doc_type).toBe('Invoice')
    expect(getScreenshotMock).toHaveBeenCalled()
    expect(Array.isArray(createMock.mock.calls[0][0].messages[1].content)).toBe(true)
  })

  it('returns null (no model call) when a no-text PDF cannot be rasterized', async () => {
    getTextMock.mockResolvedValue({ text: '' })
    getScreenshotMock.mockRejectedValue(new Error('not a pdf'))
    expect(await analyzeAttachment('broken.pdf', 'application/pdf', Buffer.from('xx'))).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null when rasterization yields zero pages', async () => {
    getTextMock.mockResolvedValue({ text: '' })
    getScreenshotMock.mockResolvedValue({ pages: [], total: 0 })
    expect(await analyzeAttachment('empty.pdf', 'application/pdf', Buffer.from('%PDF'))).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })
})
