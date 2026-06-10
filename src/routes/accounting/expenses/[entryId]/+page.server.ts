import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getDb, listAttachmentsByOwner } from '$lib/server/db'
import { getAccounts } from '$lib/server/accounting'

// Admin-only (page guard in hooks.server.ts). Minimal journal-entry detail —
// exists so quick expenses have a place to show their receipt attachments.
export const load: PageServerLoad = async ({ params }) => {
  const d = await getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = await (d.collection('journalEntries') as any).findOne({ _id: params.entryId })
  if (!entry) throw error(404, 'No such journal entry')
  const [accounts, attachments] = await Promise.all([
    getAccounts(),
    listAttachmentsByOwner('journal-entry', params.entryId),
  ])
  const names = Object.fromEntries(accounts.map((a) => [a._id, a.name]))
  return { entry: { ...entry, _id: String(entry._id) }, names, attachments }
}
