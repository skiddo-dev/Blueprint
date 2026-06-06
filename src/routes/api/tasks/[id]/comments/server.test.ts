import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler never touches Mongo. patchTask is the call we
// assert on; getTask backs the ownership check in assertCanAccessTask.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  getUsers: vi.fn(async () => [{ name: 'Ben' }, { name: 'Kris' }]),
  patchTask: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { POST } from './+server'
import { getTask, patchTask } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (id: string, body: unknown, locals: any): any => ({
  params: { id },
  locals,
  request: { json: async () => body },
})

describe('POST /api/tasks/[id]/comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when unauthenticated', async () => {
    await expect(POST(ev('t1', { text: 'hi' }, sessionOf(null)))).rejects.toMatchObject({ status: 401 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it('403 when a non-owner tries to comment', async () => {
    vi.mocked(getTask).mockResolvedValue({ assigned_to: 'Bob', created_by: 'Bob' } as never)
    const locals = sessionOf({ role: 'pm', displayName: 'Carol' })
    await expect(POST(ev('t1', { text: 'hi' }, locals))).rejects.toMatchObject({ status: 403 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it('rejects empty text with 400', async () => {
    const locals = sessionOf({ role: 'admin', displayName: 'Admin' })
    await expect(POST(ev('t1', { text: '   ' }, locals))).rejects.toMatchObject({ status: 400 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it('appends a comment entry with server-computed mentions', async () => {
    const locals = sessionOf({ role: 'admin', displayName: 'Admin' })
    const res = await POST(ev('t1', { text: 'hey @Ben please review' }, locals))
    expect(res.status).toBe(201)
    const { entry } = await res.json()
    expect(entry).toMatchObject({ kind: 'comment', text: 'hey @Ben please review', author: 'Admin', mentions: ['Ben'] })
    expect(patchTask).toHaveBeenCalledWith('t1', {}, expect.objectContaining({ kind: 'comment', mentions: ['Ben'] }))
  })
})
