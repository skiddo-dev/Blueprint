import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { generateQuotePdf } from '$lib/server/pdf'
import type { QuoteData } from '$lib/server/pdf'
import { insertQuote } from '$lib/server/db'

const AMOUNT_RANGES: Record<string, [number, number]> = {
  'Assign Quote': [5000, 50000],
  'T&M': [2000, 20000],
  'Service Call': [500, 5000],
  'Maintenance Request': [1000, 10000],
  'Emergency Repair': [3000, 30000],
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json() as Partial<QuoteData> & { total?: number }

  const labor = body.labor ?? 0
  const materials = body.materials ?? 0
  let total = body.total ?? 0
  if (!total) {
    if (labor > 0 || materials > 0) {
      total = labor + materials
    } else {
      const [lo, hi] = AMOUNT_RANGES[body.quote_type ?? ''] ?? [250, 5000]
      total = lo + Math.floor(Math.random() * (hi - lo))
    }
  }

  const data: QuoteData = {
    customer: body.customer ?? 'TBD',
    date_received: body.date_received ?? new Date().toISOString().slice(0, 10),
    bid_due_date: body.bid_due_date ?? '',
    architect: body.architect ?? '',
    project_location: body.project_location ?? 'TBD',
    description: body.description ?? '',
    notes: body.notes,
    labor,
    materials,
    total,
    quote_type: body.quote_type ?? '',
  }

  // Track the generated quote (RAVES Quote Log shape) so it shows up in the
  // dashboard analytics. Best-effort: a failure must never block the PDF.
  // NOTE: mapping from the current proposal form is approximate until the
  // generator form is reshaped to capture store #, point of contact, and the
  // work-category description directly.
  try {
    const year = new Date(data.date_received).getFullYear() || new Date().getFullYear()
    await insertQuote({
      year,
      store_number: data.project_location,
      point_of_contact: data.architect,
      description: data.quote_type,
      amount: data.total,
      date_sent: data.date_received,
      sitefolio: false,
      po: '',
      notes: [data.description, data.notes].filter(Boolean).join(' — '),
      source: 'generated',
      created_by: (user.displayName as string) || (user.email as string) || '',
    })
  } catch (e) {
    console.error('[quotes] failed to persist generated quote:', e)
  }

  const pdf = await generateQuotePdf(data)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Proposal_${data.customer.replace(/\s+/g, '_')}_${data.date_received}.pdf"`,
    },
  })
}
