import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer — these tests pin the GET handler's scoping/plumbing, not Mongo.
vi.mock('$lib/server/db', () => ({
  getTasks: vi.fn(async () => []),
  getTasksForUser: vi.fn(async () => []),
  getUserEmailByName: vi.fn(async () => 'pm@x.com'),
  insertTask: vi.fn(async () => 't1'),
  deleteTask: vi.fn(async () => true),
  resolveCoAssignees: vi.fn(async () => ({ co_assignees: [], co_assignee_emails: [] })),
  archiveStaleClosedTasks: vi.fn(async () => 0),
}))

import { GET } from './+server'
import { getTasks, getTasksForUser, archiveStaleClosedTasks } from '$lib/server/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (user: Record<string, unknown> | null, query = ''): any => ({
  locals: { auth: async () => (user ? { user } : null) },
  url: new URL(`http://x/api/tasks${query}`),
})

describe('GET /api/tasks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an unauthenticated request', async () => {
    await expect(GET(ev(null))).rejects.toMatchObject({ status: 401 })
  })

  it('admin gets the full live board, and the lazy archive sweep runs', async () => {
    const res = await GET(ev({ role: 'admin' }))
    expect(res.status).toBe(200)
    expect(archiveStaleClosedTasks).toHaveBeenCalled()
    expect(getTasks).toHaveBeenCalledWith({ archived: false })
  })

  it('?archived=1 flips to the archive with the same role scoping', async () => {
    await GET(ev({ role: 'admin' }, '?archived=1'))
    expect(getTasks).toHaveBeenCalledWith({ archived: true })

    await GET(ev({ role: 'pm', displayName: 'Pat', email: 'pat@x.com' }, '?archived=1'))
    expect(getTasksForUser).toHaveBeenCalledWith('pat@x.com', 'Pat', { archived: true })
  })

  it('a PM is always scoped to their own tasks, even with ?user=', async () => {
    await GET(ev({ role: 'pm', displayName: 'Pat', email: 'pat@x.com' }, '?user=SomeoneElse'))
    expect(getTasksForUser).toHaveBeenCalledWith('pat@x.com', 'Pat', { archived: false })
    expect(getTasks).not.toHaveBeenCalled()
  })

  it('a sweep failure never takes the board down', async () => {
    vi.mocked(archiveStaleClosedTasks).mockRejectedValueOnce(new Error('mongo hiccup'))
    const res = await GET(ev({ role: 'admin' }))
    expect(res.status).toBe(200)
  })
})
