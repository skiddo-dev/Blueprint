import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler never touches Mongo.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  patchTask: vi.fn(async () => true),
}))

import { POST } from './+server'
import { getTask, patchTask } from '$lib/server/db'

// Admin session bypasses the ownership check, isolating the move logic.
const admin = { auth: async () => ({ user: { role: 'admin' } }) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (id: string, body: unknown): any => ({
  params: { id },
  locals: admin,
  request: { json: async () => body },
})

describe('POST /api/tasks/[id]/move — drag-drop persistence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('same-column reorder writes the rank only (no status churn, no aging reset)', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'To Do' } as never)
    const res = await POST(ev('t1', { status: 'To Do', rank: 'ai' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(patchTask).toHaveBeenCalledWith('t1', { rank: 'ai' })
  })

  it('cross-column move writes status + rank and restarts the aging clock', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'To Do' } as never)
    const res = await POST(ev('t1', { status: 'In Progress', rank: 'r5' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(patchTask).toHaveBeenCalledWith('t1', {
      rank: 'r5',
      status: 'In Progress',
      status_changed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('404s for a missing task', async () => {
    vi.mocked(getTask).mockResolvedValue(null as never)
    await expect(POST(ev('nope', { status: 'To Do', rank: 'ai' }))).rejects.toMatchObject({ status: 404 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it('rejects an unknown status', async () => {
    await expect(POST(ev('t1', { status: 'Someday', rank: 'ai' }))).rejects.toMatchObject({ status: 400 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it.each([
    ['', 'empty'],
    ['a0', 'trailing zero (would wedge future drops)'],
    ['A1', 'uppercase (outside the generator charset)'],
    ['a b', 'whitespace'],
    [42, 'non-string'],
  ])('rejects rank %j (%s)', async (rank, _why) => {
    await expect(POST(ev('t1', { status: 'To Do', rank }))).rejects.toMatchObject({ status: 400 })
    expect(patchTask).not.toHaveBeenCalled()
  })
})
