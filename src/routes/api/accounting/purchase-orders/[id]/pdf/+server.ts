import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getPO } from '$lib/server/purchaseOrders'
import { generatePurchaseOrderPdf } from '$lib/server/pdf'
import { requireAdmin } from '$lib/server/authz'
import { contentDisposition } from '$lib/sanitize'
import { poNumber } from '$lib/accounting/purchaseOrders'

// Admin-only. The printable PO you send to the vendor.
export const GET: RequestHandler = async ({ params, locals }) => {
  await requireAdmin(locals)
  const po = await getPO(params.id)
  if (!po) throw error(404, 'No such purchase order')
  const pdf = await generatePurchaseOrderPdf(po)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(`${poNumber(po)}_${po.vendor_name}.pdf`, 'inline'),
    },
  })
}
