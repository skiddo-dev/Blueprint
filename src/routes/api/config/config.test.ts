import { describe, it, expect } from 'vitest'
import { GET } from './+server'
import { KANBAN_STATUSES, STATUS_META, QUOTE_STATUSES, PROSPECT_STATUSES } from '$lib/constants'

// Minimal RequestEvent stand-ins — the handler only touches `locals.auth` and
// `setHeaders`.
const authed = { locals: { auth: async () => ({ user: { role: 'pm' } }) }, setHeaders: () => {} }
const anon = { locals: { auth: async () => null }, setHeaders: () => {} }

describe('GET /api/config', () => {
  it('re-serves the UI constants from constants.ts verbatim', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(authed as any)
    expect(res.status).toBe(200)
    const body = await res.json()

    // The contract both clients depend on must match the source module exactly.
    expect(body.taskStatuses).toEqual(KANBAN_STATUSES)
    expect(body.statusMeta).toEqual(STATUS_META)
    expect(body.quoteStatuses).toEqual(QUOTE_STATUSES)
    expect(body.prospect.statuses).toEqual(PROSPECT_STATUSES)
    // Spot-check a colour the Swift enum hand-copies — drift here = drift there.
    expect(body.statusMeta['To Do'].color).toBe(STATUS_META['To Do'].color)
  })

  it('rejects an unauthenticated request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(GET(anon as any)).rejects.toMatchObject({ status: 401 })
  })
})
