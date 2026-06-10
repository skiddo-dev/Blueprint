import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getCustomer, listCustomerOpenInvoices } from '$lib/server/invoicing'
import { generateCustomerStatement } from '$lib/server/pdf'

// Admin-only. A customer's open-balance statement as a PDF — what you attach
// to a collections email. Mirrors the invoice/bill PDF endpoints.
export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const customer = await getCustomer(params.id)
  if (!customer) throw error(404, 'Customer not found')
  const invoices = await listCustomerOpenInvoices(params.id)
  const asOf = new Date().toISOString().slice(0, 10)

  const pdf = await generateCustomerStatement({ customer, invoices, asOf })
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="statement-${customer.name.replace(/[^\w-]+/g, '_')}-${asOf}.pdf"`,
    },
  })
}
