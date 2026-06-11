import type { PageServerLoad } from './$types'
import { listInvoices, getCustomer } from '$lib/server/invoicing'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ url }) => {
  // ?customer=<id> narrows the list to one customer (linked from /accounting/customers).
  const customerId = url.searchParams.get('customer')
  if (!customerId) return { invoices: await listInvoices(), customerFilter: null }
  // Higher limit when filtered — the per-customer view should be complete.
  const invoices = (await listInvoices(1000)).filter((i) => i.customer_id === customerId)
  const customer = await getCustomer(customerId)
  return {
    invoices,
    customerFilter: { id: customerId, name: customer?.name ?? invoices[0]?.customer_name ?? 'Unknown customer' },
  }
}
