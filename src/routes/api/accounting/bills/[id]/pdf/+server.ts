import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getBill } from '$lib/server/payables'
import { generateBillPdf } from '$lib/server/pdf'
import { contentDisposition } from '$lib/sanitize'

// Admin-only: a printable record of a vendor bill as a PDF.
export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const bill = await getBill(params.id)
  if (!bill) throw error(404, 'Bill not found')

  const pdf = await generateBillPdf(bill)
  const num = `${bill.year}-${String(bill.number).padStart(4, '0')}`
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(`Bill_${num}_${bill.vendor_name.replace(/\s+/g, '_')}.pdf`),
    },
  })
}
