import { PDFParse } from 'pdf-parse'
import type OpenAI from 'openai'
import { getClient, MODEL } from './openai'
import { normalizeStoreNumbers } from '$lib/storeNumbers'

// Reads the documents PMs retype by hand today — POs, scopes, and bids that
// arrive as email attachments (downloaded + stored, but never opened until now).
// Text is extracted locally (pdf-parse for PDFs, raw decode for txt/csv); image
// attachments (scanned POs arrive as PNG/JPEG) go to the same model as vision
// input. Both paths share one gpt-4o-mini Structured-Outputs call. Anything else
// (Office docs, archives, image-only PDFs) is skipped.

const TEXT_CAP = 8000

export interface ParsedDoc {
  doc_type: 'Purchase Order' | 'Quote/Bid' | 'Scope of Work' | 'Invoice' | 'Receipt' | 'Drawing' | 'Other' | null
  po: string | null
  amount: string | null            // "$12,300" exactly as written
  vendor: string | null            // who issued the document (seller/payee)
  doc_date: string | null          // ISO YYYY-MM-DD when clearly printed
  store_numbers: string[]
  summary: string                  // ≤160 chars
  pertinent: boolean               // worth surfacing on the card summary
  confidence: number               // 0–1
}

const DOC_TYPES = ['Purchase Order', 'Quote/Bid', 'Scope of Work', 'Invoice', 'Receipt', 'Drawing', 'Other']

function isType(filename: string, contentType: string | undefined, ext: string, mime: RegExp): boolean {
  return filename.toLowerCase().endsWith(ext) || (!!contentType && mime.test(contentType))
}

/** Pull plain text from a parseable attachment. Returns null for unsupported
 *  types (image-only PDFs yield little/no text — handled by the caller's null
 *  guard). Never throws — a bad file degrades to null, never blocks a sync. */
export async function extractText(
  filename: string,
  contentType: string | undefined,
  buf: Buffer,
): Promise<string | null> {
  try {
    if (isType(filename, contentType, '.pdf', /pdf/i)) {
      const parser = new PDFParse({ data: buf })
      try {
        const { text } = await parser.getText()
        const trimmed = (text ?? '').trim()
        return trimmed ? trimmed.slice(0, TEXT_CAP) : null
      } finally {
        await parser.destroy()
      }
    }
    if (
      isType(filename, contentType, '.csv', /csv/i) ||
      isType(filename, contentType, '.txt', /text\/plain/i)
    ) {
      const text = buf.toString('utf8').trim()
      return text ? text.slice(0, TEXT_CAP) : null
    }
    return null
  } catch {
    return null
  }
}

function buildSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['doc_type', 'po', 'amount', 'vendor', 'doc_date', 'store_numbers', 'summary', 'pertinent', 'confidence'],
    properties: {
      doc_type: {
        type: ['string', 'null'],
        enum: [...DOC_TYPES, null],
        description: 'What kind of document this is. Null if it does not fit any category.',
      },
      po: {
        type: ['string', 'null'],
        description: 'Purchase order or work-order number if present (e.g. "4471", "PO-4471"). Null if none.',
      },
      amount: {
        type: ['string', 'null'],
        description: 'The total / quoted dollar amount exactly as written, e.g. "$12,300.00". Null if none.',
      },
      vendor: {
        type: ['string', 'null'],
        description: 'The business that issued the document (the seller/payee on a receipt or invoice). Null if unclear.',
      },
      doc_date: {
        type: ['string', 'null'],
        description: 'The document date as ISO YYYY-MM-DD, only when a date is clearly printed. Null otherwise.',
      },
      store_numbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Store/site numbers referenced, as 3-digit strings; strip any "D-" prefix. Empty array if none.',
      },
      summary: {
        type: 'string',
        description:
          'One sentence (≤160 chars) of the concrete facts a project manager needs: what work, ' +
          'which store(s), key amounts or dates. Not a description of the file itself.',
      },
      pertinent: {
        type: 'boolean',
        description:
          'True when the document adds real project information worth showing on the task card ' +
          '(scope, pricing, PO, schedule, requirements). False for signatures, logos, marketing, ' +
          'boilerplate, or near-empty documents.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this extraction from 0 (guessing) to 1 (certain).',
      },
    },
  }
}

const SYSTEM_PROMPT = `You extract structured data from documents (or photos/scans of documents) attached to RAVES grocery-construction emails — typically purchase orders, quotes/bids, scopes of work, and invoices.
Pull the purchase-order number, the headline dollar amount, and any store/site numbers. Prefer null over guessing. Reflect uncertainty in "confidence".
Write "summary" as the concrete facts a project manager needs (what work, which store, key amounts/dates), not a description of the file.
Set "pertinent" true only when the document adds real project information worth surfacing on the task card.`

const EMPTY: ParsedDoc = {
  doc_type: null, po: null, amount: null, vendor: null, doc_date: null,
  store_numbers: [], summary: '', pertinent: false, confidence: 0,
}

type UserContent = string | OpenAI.Chat.Completions.ChatCompletionContentPart[]

/** One Structured-Outputs extraction call shared by the text and vision paths.
 *  Graceful: any failure returns the empty ParsedDoc so a sync never blocks. */
async function extractWithLLM(userContent: UserContent): Promise<ParsedDoc> {
  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'doc_extraction', strict: true, schema: buildSchema() },
      },
    })

    const choice = resp.choices[0]?.message
    if (choice?.refusal) throw new Error(`model refusal: ${choice.refusal}`)
    const data = JSON.parse(choice?.content ?? '{}')

    return {
      doc_type: data.doc_type ?? null,
      po: data.po ?? null,
      amount: data.amount ?? null,
      vendor: data.vendor ?? null,
      doc_date: typeof data.doc_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.doc_date) ? data.doc_date : null,
      store_numbers: normalizeStoreNumbers(Array.isArray(data.store_numbers) ? data.store_numbers : []),
      summary: String(data.summary ?? '').slice(0, 160),
      pertinent: data.pertinent === true,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    }
  } catch {
    return EMPTY
  }
}

/** Extract PO #, amount, store numbers, and a one-line summary from a document's
 *  text. Graceful: any failure returns an empty ParsedDoc so a sync never blocks. */
export async function parseAttachmentWithLLM(text: string, filename: string): Promise<ParsedDoc> {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { ...EMPTY }
  return extractWithLLM(`Filename: ${filename}\n\n${trimmed.slice(0, TEXT_CAP)}`)
}

// Image formats the vision API accepts. Scans of POs/invoices arrive as camera
// photos or scanner output — png/jpeg in practice; webp/gif are also supported.
const IMAGE_MIMES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
}

/** The canonical image MIME for a vision-readable attachment, or null when the
 *  file isn't an image the API accepts. Same ext-or-content-type gate extractText
 *  uses for its formats. */
export function imageMime(filename: string, contentType: string | undefined): string | null {
  const lower = filename.toLowerCase()
  for (const [ext, mime] of Object.entries(IMAGE_MIMES)) {
    if (lower.endsWith(ext)) return mime
  }
  const ct = (contentType ?? '').toLowerCase().split(';')[0].trim()
  return Object.values(IMAGE_MIMES).includes(ct) ? ct : null
}

/** Extract the same ParsedDoc from an image attachment (a scanned/photographed
 *  document) by sending it to the model as vision input. */
export async function parseImageAttachmentWithLLM(
  buf: Buffer,
  mime: string,
  filename: string,
): Promise<ParsedDoc> {
  if (!buf.length) return { ...EMPTY }
  return extractWithLLM([
    { type: 'text', text: `Filename: ${filename}\nThe attached image is a scanned or photographed document.` },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } },
  ])
}

/** Unified entry for "read this attachment": local text extraction when the
 *  format allows it, vision for images, null for everything else (Office docs,
 *  archives, image-only PDFs). Null means "unreadable", distinct from a readable
 *  doc that yielded nothing. */
export async function analyzeAttachment(
  filename: string,
  contentType: string | undefined,
  buf: Buffer,
): Promise<ParsedDoc | null> {
  const text = await extractText(filename, contentType, buf)
  if (text) return parseAttachmentWithLLM(text, filename)
  const mime = imageMime(filename, contentType)
  if (mime) return parseImageAttachmentWithLLM(buf, mime, filename)
  return null
}
