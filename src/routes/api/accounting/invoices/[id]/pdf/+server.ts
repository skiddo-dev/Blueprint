import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getInvoice } from '$lib/server/invoicing'
import { generateInvoicePdf } from '$lib/server/pdf'
import { contentDisposition } from '$lib/sanitize'

// Admin-only: the customer-facing invoice as a PDF. Mirrors the quote-PDF
// download (Content-Type: application/pdf + a safe Content-Disposition).
export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const invoice = await getInvoice(params.id)
  if (!invoice) throw error(404, 'Invoice not found')

  const pdf = await generateInvoicePdf(invoice)
  const num = `${invoice.year}-${String(invoice.number).padStart(4, '0')}`
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(`Invoice_${num}_${invoice.customer_name.replace(/\s+/g, '_')}.pdf`),
    },
  })
}
