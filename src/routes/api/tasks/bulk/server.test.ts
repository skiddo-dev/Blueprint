import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(async (id: string) => ({ _id: id, status: 'To Do' })),
  patchTask: vi.fn(async () => true),
  deleteTask: vi.fn(async () => true),
  getUserEmailByName: vi.fn(async () => 'dana@x.com'),
  topRankForStatus: vi.fn(async () => 'top1'),
}))
// Real authz is exercised via the session role: admin passes, PM ownership is
// stubbed per-test through getTask (assertCanAccessTask reads the task itself).
vi.mock('$lib/server/authz', () => ({
  assertCanAccessTask: vi.fn(async () => {}),
}))

import { POST } from './+server'
import { getTask, patchTask, deleteTask } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'

const admin = { auth: async () => ({ user: { role: 'admin' } }) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (body: unknown): any => ({ locals: admin, request: { json: async () => body } })

describe('POST /api/tasks/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTask).mockImplementation(async (id: string) => ({ _id: id, status: 'To Do' }) as never)
    vi.mocked(assertCanAccessTask).mockResolvedValue(undefined as never)
  })

  it('bulk status change mirrors the single-card move semantics', async () => {
    const res = await POST(ev({ ids: ['a', 'b'], action: 'status', value: 'Review' }))
    expect(await res.json()).toEqual({ ok: true, done: 2, skipped: 0 })
    expect(patchTask).toHaveBeenCalledWith('a', {
      status: 'Review',
      status_changed_at: expect.stringMatching(/^\d{4}/),
      rank: 'top1',
    }, undefined, undefined)
  })

  it('bulk assign resolves identity and auto-starts To Do cards', async () => {
    await POST(ev({ ids: ['a'], action: 'assign', value: 'Dana' }))
    expect(patchTask).toHaveBeenCalledWith('a', {
      assigned_to: 'Dana',
      assignee_email: 'dana@x.com',
      status: 'In Progress',
      status_changed_at: expect.stringMatching(/^\d{4}/),
      rank: 'top1',
    }, undefined, undefined)
  })

  it('bulk archive stamps archived_at; delete deletes', async () => {
    await POST(ev({ ids: ['a'], action: 'archive' }))
    expect(patchTask).toHaveBeenCalledWith('a', { archived_at: expect.stringMatching(/^\d{4}/) })

    await POST(ev({ ids: ['a', 'b'], action: 'delete' }))
    expect(deleteTask).toHaveBeenCalledTimes(2)
  })

  it('a status change restores an archived card', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 'a', status: 'Done', archived_at: '2026-05-01' } as never)
    await POST(ev({ ids: ['a'], action: 'status', value: 'To Do' }))
    expect(patchTask).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'To Do' }), undefined, ['archived_at'])
  })

  it('inaccessible or missing cards are skipped, not fatal', async () => {
    vi.mocked(assertCanAccessTask).mockImplementation(async (_l: unknown, id: string) => {
      if (id === 'theirs') throw Object.assign(new Error('forbidden'), { status: 403 })
    })
    const res = await POST(ev({ ids: ['mine', 'theirs'], action: 'status', value: 'Done' }))
    expect(await res.json()).toEqual({ ok: true, done: 1, skipped: 1 })
  })

  it('no-op when already in the target state still counts as done', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 'a', status: 'Review' } as never)
    const res = await POST(ev({ ids: ['a'], action: 'status', value: 'Review' }))
    expect(await res.json()).toEqual({ ok: true, done: 1, skipped: 0 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it('validates: bad action, bad status value, missing assignee, empty ids', async () => {
    await expect(POST(ev({ ids: ['a'], action: 'explode' }))).rejects.toMatchObject({ status: 400 })
    await expect(POST(ev({ ids: ['a'], action: 'status', value: 'Nope' }))).rejects.toMatchObject({ status: 400 })
    await expect(POST(ev({ ids: ['a'], action: 'assign' }))).rejects.toMatchObject({ status: 400 })
    await expect(POST(ev({ ids: [], action: 'delete' }))).rejects.toMatchObject({ status: 400 })
  })

  it('rejects an unauthenticated request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anon: any = { locals: { auth: async () => null }, request: { json: async () => ({ ids: ['a'], action: 'delete' }) } }
    await expect(POST(anon)).rejects.toMatchObject({ status: 401 })
  })
})
