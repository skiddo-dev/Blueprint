import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  insertTask: vi.fn(async () => 'id'),
  getUserEmailByName: vi.fn(async () => null),
}))

import { POST } from './+server'
import { insertTask } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (body: unknown, user: unknown): any => ({ locals: sessionOf(user), request: { json: async () => body } })
const admin = { role: 'admin', displayName: 'Admin', email: 'admin@x.com' }

describe('POST /api/tasks/import', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a task per valid row, defaults unknown status to To Do, skips title-less rows', async () => {
    const csv = 'title,status,assigned_to\nRoof permit,In Progress,Ben\n,Done,X\nFence,Bogus,'
    const res = await POST(ev({ csv }, admin))
    const out = await res.json()
    expect(out).toMatchObject({ created: 2, skipped: 1 })
    expect(insertTask).toHaveBeenCalledTimes(2)
    expect(insertTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Roof permit', status: 'In Progress' }))
    expect(insertTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fence', status: 'To Do' })) // Bogus → default
  })

  it('400s on empty csv', async () => {
    await expect(POST(ev({ csv: '   ' }, admin))).rejects.toMatchObject({ status: 400 })
  })

  it('reports a friendly result when there are no data rows', async () => {
    const res = await POST(ev({ csv: 'title,status' }, admin))
    expect(await res.json()).toMatchObject({ created: 0, skipped: 0 })
    expect(insertTask).not.toHaveBeenCalled()
  })
})
