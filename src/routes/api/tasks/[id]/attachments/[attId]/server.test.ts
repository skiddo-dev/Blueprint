import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler/authz never touch Mongo. deleteAttachment is
// the call we assert on; getTask backs the ownership check in assertCanAccessTask.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  deleteAttachment: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { DELETE } from './+server'
import { getTask, deleteAttachment } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (locals: any): any => ({ params: { id: 't1', attId: 'a1' }, locals })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTask).mockResolvedValue({ assigned_to: 'Bob', created_by: 'Bob' } as never)
})

describe('DELETE /api/tasks/[id]/attachments/[attId]', () => {
  it('401 when unauthenticated', async () => {
    await expect(DELETE(ev(sessionOf(null)))).rejects.toMatchObject({ status: 401 })
    expect(deleteAttachment).not.toHaveBeenCalled()
  })

  it('403 when a non-owner tries to delete', async () => {
    const locals = sessionOf({ role: 'pm', displayName: 'Mallory' })
    await expect(DELETE(ev(locals))).rejects.toMatchObject({ status: 403 })
    expect(deleteAttachment).not.toHaveBeenCalled()
  })

  it('removes the attachment for an owner, scoped to the task id', async () => {
    const locals = sessionOf({ role: 'pm', displayName: 'Bob' })
    const res = await DELETE(ev(locals))
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteAttachment).toHaveBeenCalledWith('t1', 'a1')
  })

  it('lets an admin delete any task’s attachment', async () => {
    const locals = sessionOf({ role: 'admin', displayName: 'Admin' })
    const res = await DELETE(ev(locals))
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteAttachment).toHaveBeenCalledWith('t1', 'a1')
  })
})
