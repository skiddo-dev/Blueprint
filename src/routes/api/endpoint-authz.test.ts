import { describe, it, expect } from 'vitest'
import { POST as syncPOST } from './sync/+server'
import { GET as usersGET, POST as usersPOST, DELETE as usersDELETE } from './users/+server'
import { GET as reqGET, POST as reqPOST } from './users/requests/+server'
import { POST as quoteGenPOST } from './quotes/generate/+server'
import { POST as quoteStatusPOST } from './quotes/[id]/status/+server'
import { PATCH as prospectPATCH } from './prospects/[id]/+server'
import { GET as tasksGET, DELETE as tasksDELETE } from './tasks/+server'
import { GET as exportGET } from './tasks/export/+server'
import { POST as importPOST } from './tasks/import/+server'
import { GET as signatureGET } from './tasks/signature/+server'
import { PATCH as taskPATCH, DELETE as taskDELETE } from './tasks/[id]/+server'
import { POST as attachPOST } from './tasks/[id]/attachments/+server'
import { DELETE as attachDELETE } from './tasks/[id]/attachments/[attId]/+server'

// Every handler below checks auth (and role) BEFORE touching the DB, so these
// assertions exercise only the guard path — no mocks required. This is the
// belt-and-braces sweep: even though hooks.server.ts gates routes globally, each
// endpoint must independently reject unauthenticated / wrong-role callers.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => unknown
// Normalize a handler result (sync or async) to a promise so .rejects works.
const run = (h: Handler, e: unknown) => Promise.resolve(h(e))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (user: unknown): any => ({
  locals: { auth: async () => (user ? { user } : null) },
  request: { json: async () => ({}) },
  params: { id: 'x' },
  url: new URL('https://example.test/api/x'),
})
const pm = { role: 'pm', email: 'pm@example.test', displayName: 'PM' }

// Admin-only endpoints: 401 for anon, 403 for an authenticated non-admin.
const adminOnly: { name: string; h: Handler }[] = [
  { name: 'POST /api/sync', h: syncPOST },
  { name: 'GET /api/users', h: usersGET },
  { name: 'POST /api/users', h: usersPOST },
  { name: 'DELETE /api/users', h: usersDELETE },
  { name: 'GET /api/users/requests', h: reqGET },
  { name: 'POST /api/users/requests', h: reqPOST },
  { name: 'POST /api/quotes/generate', h: quoteGenPOST },
  { name: 'POST /api/quotes/[id]/status', h: quoteStatusPOST },
  { name: 'PATCH /api/prospects/[id]', h: prospectPATCH },
  { name: 'DELETE /api/tasks', h: tasksDELETE },
  { name: 'GET /api/tasks/export', h: exportGET },
  { name: 'POST /api/tasks/import', h: importPOST },
]

// Auth-required endpoints (any provisioned role); we assert only the anon → 401
// guard here (owner-level 403 is covered by the task/attachment authz tests).
const authOnly: { name: string; h: Handler }[] = [
  { name: 'GET /api/tasks', h: tasksGET },
  { name: 'GET /api/tasks/signature', h: signatureGET },
  { name: 'PATCH /api/tasks/[id]', h: taskPATCH },
  { name: 'DELETE /api/tasks/[id]', h: taskDELETE },
  { name: 'POST /api/tasks/[id]/attachments', h: attachPOST },
  { name: 'DELETE /api/tasks/[id]/attachments/[attId]', h: attachDELETE },
]

describe('endpoint authorization sweep', () => {
  describe.each([...adminOnly, ...authOnly])('$name', ({ h }) => {
    it('rejects an unauthenticated request with 401', async () => {
      await expect(run(h, ev(null))).rejects.toMatchObject({ status: 401 })
    })
  })

  describe.each(adminOnly)('$name', ({ h }) => {
    it('rejects a non-admin (pm) with 403', async () => {
      await expect(run(h, ev(pm))).rejects.toMatchObject({ status: 403 })
    })
  })
})
