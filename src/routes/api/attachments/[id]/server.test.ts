import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler/authz never touch Mongo.
vi.mock('$lib/server/db', () => ({
  getAttachment: vi.fn(),
  getTask: vi.fn(),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { GET } from './+server'
import { getAttachment, getTask } from '$lib/server/db'

const ATT = { _id: 'a1', task_id: 't1', data: Buffer.from('hi'), content_type: 'text/plain', filename: 'f.txt' }
const TASK = { _id: 't1', assigned_to: 'Bob', created_by: 'Carol' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (user: unknown): any => ({
  params: { id: 'a1' },
  locals: { auth: async () => (user ? { user } : null) },
})

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(getAttachment as any).mockResolvedValue(ATT)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(getTask as any).mockResolvedValue(TASK)
})

describe('GET /api/attachments/[id] — ownership (IDOR guard)', () => {
  it('serves the file to an admin', async () => {
    const res = await GET(ev({ role: 'admin' }))
    expect(res.status).toBe(200)
  })

  it('serves the file to the assignee/creator', async () => {
    const res = await GET(ev({ role: 'pm', displayName: 'Bob' }))
    expect(res.status).toBe(200)
  })

  it('403s a signed-in non-owner (the IDOR case)', async () => {
    await expect(GET(ev({ role: 'pm', displayName: 'Mallory' }))).rejects.toMatchObject({ status: 403 })
  })

  it('401s an unauthenticated request', async () => {
    await expect(GET(ev(null))).rejects.toMatchObject({ status: 401 })
  })

  it('404s a missing attachment', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getAttachment as any).mockResolvedValue(null)
    await expect(GET(ev({ role: 'admin' }))).rejects.toMatchObject({ status: 404 })
  })
})
