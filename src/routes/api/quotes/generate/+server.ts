import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { generateQuotePdf } from '$lib/server/pdf'
import type { QuoteData } from '$lib/server/pdf'
import { insertQuote, getNextQuoteNumber } from '$lib/server/db'
import { canonicalizeContact, canonicalizeWorkType } from '$lib/quoteCanonical'
import { contentDisposition } from '$lib/sanitize'

// Payload from the Quote Generator form: log fields (store #, point of contact,
// work type, amount, …) plus the customer-facing proposal fields.
interface QuotePayload {
  customer?: string
  store_number?: string
  point_of_contact?: string
  work_type?: string
  amount?: number
  labor?: number
  materials?: number
  show_labor?: boolean
  show_total?: boolean
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

  // Customer-facing proposal PDF. `amount` stays the single logged figure (the
  // quote log tracks one Amount per quote); the show flags only control which
  // cost-box lines the PDF prints.
  const showLabor = !!body.show_labor
  const pdfData: QuoteData = {
    customer: body.customer || 'TBD',
    date_received: dateSent,
    bid_due_date: body.bid_due_date ?? '',
    architect: body.point_of_contact ?? '',
    project_location: storeNumber ? `Store #${storeNumber}` : 'TBD',
    description: body.description ?? '',
    notes: body.notes,
    labor: showLabor ? Number(body.labor) || 0 : 0,
    materials: showLabor ? Number(body.materials) || 0 : 0,
    total: amount,
    show_labor: showLabor,
    show_total: body.show_total !== false,
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
      point_of_contact: canonicalizeContact(body.point_of_contact),
      description: canonicalizeWorkType(body.work_type),
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
      'Content-Disposition': contentDisposition(`Proposal_${pdfData.customer.replace(/\s+/g, '_')}_${dateSent}.pdf`),
    },
  })
}
