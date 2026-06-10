import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  KANBAN_STATUSES,
  STATUS_META,
  QUOTE_TYPES,
  QUOTE_PEOPLE,
  QUOTE_CONTACTS,
  QUOTE_WORK_TYPES,
  SUPERVISORS,
  QUOTE_STATUSES,
  QUOTE_STATUS_META,
  PROSPECT_CENTER,
  PROSPECT_DEFAULTS,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_META,
  AGING_THRESHOLDS,
  WIP_LIMITS,
  ARCHIVE_AFTER_DAYS,
} from '$lib/constants'

// Single source of truth for the app's UI constants. `src/lib/constants.ts` is
// the ONE place these are defined: the web bundles them at build time (typed
// imports), and this endpoint re-serves the exact same values so non-bundled
// clients — notably the native iOS app — read one contract instead of
// hand-copying status colours / labels / rosters and silently drifting.
//
// Keep this a thin re-export of `constants.ts`. Never redefine a value here.
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
  // Any authenticated user may read config (the board itself needs the status
  // colours), so there's no role gate. The global guard already requires a
  // session; mirror the other API routes' explicit 401 for API clients.
  const session = await locals.auth()
  if (!session?.user) throw error(401)

  // Config is static per deploy — let clients cache briefly.
  setHeaders({ 'cache-control': 'private, max-age=300' })

  return json({
    taskStatuses: KANBAN_STATUSES,
    statusMeta: STATUS_META,
    quoteTypes: QUOTE_TYPES,
    quotePeople: QUOTE_PEOPLE,
    quoteContacts: QUOTE_CONTACTS,
    quoteWorkTypes: QUOTE_WORK_TYPES,
    supervisors: SUPERVISORS,
    quoteStatuses: QUOTE_STATUSES,
    quoteStatusMeta: QUOTE_STATUS_META,
    // Flow signals (board V2): aging thresholds, soft WIP limits, archive window.
    aging: AGING_THRESHOLDS,
    wipLimits: WIP_LIMITS,
    archiveAfterDays: ARCHIVE_AFTER_DAYS,
    prospect: {
      center: PROSPECT_CENTER,
      defaults: PROSPECT_DEFAULTS,
      statuses: PROSPECT_STATUSES,
      statusMeta: PROSPECT_STATUS_META,
    },
  })
}
