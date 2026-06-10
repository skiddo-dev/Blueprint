import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler/authz never touch Mongo.
vi.mock('$lib/server/db', () => ({
  getAttachment: vi.fn(),
  getTask: vi.fn(),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { Binary } from 'mongodb'
import { GET } from './+server'
import { getAttachment, getTask } from '$lib/server/db'

// `data` is a BSON Binary — the type the driver actually hands back for a stored
// Buffer. Mocking a plain Buffer here is what hid the 0-byte-download bug.
const ATT = { _id: 'a1', task_id: 't1', data: new Binary(Buffer.from('hi')), content_type: 'text/plain', filename: 'f.txt' }
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

  it('serves the stored bytes when the driver returns BSON Binary (0-byte regression)', async () => {
    const res = await GET(ev({ role: 'admin' }))
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('hi')
  })

  it('serves the stored bytes when `data` is a plain Buffer', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getAttachment as any).mockResolvedValue({ ...ATT, data: Buffer.from('hi') })
    const res = await GET(ev({ role: 'admin' }))
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('hi')
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

  it('410s a purged attachment — bytes stripped by retention, metadata kept', async () => {
    // The record survives (filename/type), but `data` is gone after the 30-day window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getAttachment as any).mockResolvedValue({ _id: 'a1', task_id: 't1', content_type: 'text/plain', filename: 'f.txt' })
    await expect(GET(ev({ role: 'admin' }))).rejects.toMatchObject({ status: 410 })
  })
})
