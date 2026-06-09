import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getBill, getBillPayments } from '$lib/server/payables'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async ({ params }) => {
  const bill = await getBill(params.id)
  if (!bill) throw error(404, 'Bill not found')
  return { bill, payments: await getBillPayments(params.id) }
}
