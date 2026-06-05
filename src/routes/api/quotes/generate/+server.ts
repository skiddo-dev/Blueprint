import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { generateQuotePdf } from '$lib/server/pdf'
import type { QuoteData } from '$lib/server/pdf'
import { insertQuote, getNextQuoteNumber } from '$lib/server/db'

// Payload from the Quote Generator form: log fields (store #, point of contact,
// work type, amount, …) plus the customer-facing proposal fields.
interface QuotePayload {
  customer?: string
  store_number?: string
  point_of_contact?: string
  work_type?: string
  amount?: number
  date_sent?: string
  bid_due_date?: string
  po?: string
  sitefolio?: boolean
  description?: string
  notes?: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json() as QuotePayload

  const amount = Number(body.amount) || 0
  const dateSent = body.date_sent || new Date().toISOString().slice(0, 10)
  const year = new Date(dateSent).getFullYear() || new Date().getFullYear()
  const storeNumber = (body.store_number ?? '').trim()

  // Customer-facing proposal PDF. Amount is the single quoted figure, so the
  // PDF's cost box renders just "Amount" (labor/materials are unused here).
  const pdfData: QuoteData = {
    customer: body.customer || 'TBD',
    date_received: dateSent,
    bid_due_date: body.bid_due_date ?? '',
    architect: body.point_of_contact ?? '',
    project_location: storeNumber ? `Store #${storeNumber}` : 'TBD',
    description: body.description ?? '',
    notes: body.notes,
    labor: 0,
    materials: 0,
    total: amount,
    quote_type: body.work_type ?? '',
  }

  // Log the quote (RAVES Quote Log shape) so it feeds the dashboard analytics.
  // Best-effort: a tracking failure must never block the PDF download.
  try {
    const quote_number = await getNextQuoteNumber(year)
    await insertQuote({
      quote_number,
      year,
      store_number: storeNumber,
      point_of_contact: body.point_of_contact ?? '',
      description: body.work_type ?? '',
      amount,
      date_sent: dateSent,
      sitefolio: !!body.sitefolio,
      po: (body.po ?? '').trim(),
      notes: body.notes ?? '',
      status: 'open',  // a freshly generated quote is open until won/lost
      source: 'generated',
      created_by: (user.displayName as string) || (user.email as string) || '',
    })
  } catch (e) {
    console.error('[quotes] failed to persist generated quote:', e)
  }

  const pdf = await generateQuotePdf(pdfData)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Proposal_${pdfData.customer.replace(/\s+/g, '_')}_${dateSent}.pdf"`,
    },
  })
}
