import type { PageServerLoad } from './$types'
import { listInvoices } from '$lib/server/invoicing'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async () => {
  return { invoices: await listInvoices() }
}
