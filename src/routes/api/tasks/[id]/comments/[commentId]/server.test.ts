import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  updateComment: vi.fn(async () => true),
  deleteComment: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))
vi.mock('$lib/server/comments', () => ({ mentionCandidates: vi.fn(async () => ['Ben', 'Kris']) }))

import { PATCH, DELETE } from './+server'
import { getTask, updateComment, deleteComment } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (locals: any, body?: unknown): any => ({
  params: { id: 't1', commentId: 'c1' },
  locals,
  request: { json: async () => body },
})

// A task assigned to Carol (so pm Carol passes the task-access check), carrying
// comment c1 authored by Ben → Carol can access but is NOT the comment author.
const taskOwnedByBen = { _id: 't1', assigned_to: 'Carol', created_by: 'Carol', timeline: [{ kind: 'comment', id: 'c1', author_email: 'ben@x.com' }] }
// A task assigned to Ben (so pm Ben passes the task-access check) where he also
// authored comment c1 → isolates the "author may modify" path.
const taskAssignedToBen = { _id: 't1', assigned_to: 'Ben', created_by: 'Ben', timeline: [{ kind: 'comment', id: 'c1', author_email: 'ben@x.com' }] }

beforeEach(() => vi.clearAllMocks())

describe('PATCH /api/tasks/[id]/comments/[commentId] (edit)', () => {
  it('403 when a non-author, non-admin edits', async () => {
    vi.mocked(getTask).mockResolvedValue(taskOwnedByBen as never)
    const carol = sessionOf({ role: 'pm', displayName: 'Carol', email: 'carol@x.com' })
    await expect(PATCH(ev(carol, { text: 'nope' }))).rejects.toMatchObject({ status: 403 })
    expect(updateComment).not.toHaveBeenCalled()
  })

  it('lets the author edit and recomputes mentions', async () => {
    vi.mocked(getTask).mockResolvedValue(taskAssignedToBen as never)
    const ben = sessionOf({ role: 'pm', displayName: 'Ben', email: 'ben@x.com' })
    const res = await PATCH(ev(ben, { text: 'updated @Kris' }))
    expect(await res.json()).toMatchObject({ ok: true, mentions: ['Kris'] })
    expect(updateComment).toHaveBeenCalledWith('t1', 'c1', 'updated @Kris', ['Kris'])
  })

  it('lets an admin edit any comment', async () => {
    vi.mocked(getTask).mockResolvedValue(taskOwnedByBen as never)
    const admin = sessionOf({ role: 'admin', displayName: 'Admin', email: 'admin@x.com' })
    const res = await PATCH(ev(admin, { text: 'fixed' }))
    expect(await res.json()).toMatchObject({ ok: true })
    expect(updateComment).toHaveBeenCalled()
  })

  it('404 when the comment is missing', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', assigned_to: 'Carol', timeline: [] } as never)
    const admin = sessionOf({ role: 'admin', email: 'admin@x.com' })
    await expect(PATCH(ev(admin, { text: 'x' }))).rejects.toMatchObject({ status: 404 })
  })
})

describe('DELETE /api/tasks/[id]/comments/[commentId]', () => {
  it('403 for a non-author, non-admin', async () => {
    vi.mocked(getTask).mockResolvedValue(taskOwnedByBen as never)
    const carol = sessionOf({ role: 'pm', displayName: 'Carol', email: 'carol@x.com' })
    await expect(DELETE(ev(carol))).rejects.toMatchObject({ status: 403 })
    expect(deleteComment).not.toHaveBeenCalled()
  })

  it('lets the author delete (cascades to replies in db)', async () => {
    vi.mocked(getTask).mockResolvedValue(taskAssignedToBen as never)
    const ben = sessionOf({ role: 'pm', displayName: 'Ben', email: 'ben@x.com' })
    const res = await DELETE(ev(ben))
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteComment).toHaveBeenCalledWith('t1', 'c1')
  })
})
