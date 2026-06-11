import type { PageServerLoad } from './$types'
import { listBills, listVendors } from '$lib/server/payables'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ url }) => {
  // ?vendor=<id> narrows the list to one vendor (linked from /accounting/vendors).
  const vendorId = url.searchParams.get('vendor')
  if (!vendorId) return { bills: await listBills(), vendorFilter: null }
  // Higher limit when filtered — the per-vendor view should be complete.
  const bills = (await listBills(1000)).filter((b) => b.vendor_id === vendorId)
  const vendor = (await listVendors()).find((v) => v._id === vendorId)
  return {
    bills,
    vendorFilter: { id: vendorId, name: vendor?.name ?? bills[0]?.vendor_name ?? 'Unknown vendor' },
  }
}
