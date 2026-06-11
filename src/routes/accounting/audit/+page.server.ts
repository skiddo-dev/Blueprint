import type { PageServerLoad } from './$types'
import { listAudit, listAuditActors } from '$lib/server/audit'

// Admin-only (page guard in hooks.server.ts). The audit log: who did what to
// which document, newest first. ?type=&actor=&from=&to= filter it; ?limit=
// raises the 200-event default via the page's "Show more" link (capped sanely).
export const load: PageServerLoad = async ({ url }) => {
  const entity_type = url.searchParams.get('type') || undefined
  const actor = url.searchParams.get('actor') || undefined
  const from = url.searchParams.get('from') || undefined
  const to = url.searchParams.get('to') || undefined
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 5000)
  const [events, actors] = await Promise.all([
    listAudit({ entity_type, actor, from, to, limit }),
    listAuditActors(),
  ])
  return {
    events,
    actors,
    limit,
    filters: { type: entity_type ?? '', actor: actor ?? '', from: from ?? '', to: to ?? '' },
  }
}
