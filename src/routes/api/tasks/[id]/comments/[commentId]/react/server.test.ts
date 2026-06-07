import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  setCommentReactions: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { POST } from './+server'
import { getTask, setCommentReactions } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (locals: any, body: unknown): any => ({
  params: { id: 't1', commentId: 'c1' },
  locals,
  request: { json: async () => body },
})
const admin = sessionOf({ role: 'admin', displayName: 'Admin', email: 'a@x.com' })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/tasks/[id]/comments/[commentId]/react', () => {
  it('rejects an unsupported emoji', async () => {
    vi.mocked(getTask).mockResolvedValue({ timeline: [{ kind: 'comment', id: 'c1', reactions: {} }] } as never)
    await expect(POST(ev(admin, { emoji: '🚀' }))).rejects.toMatchObject({ status: 400 })
  })

  it('adds the reactor when absent', async () => {
    vi.mocked(getTask).mockResolvedValue({ timeline: [{ kind: 'comment', id: 'c1', reactions: {} }] } as never)
    const res = await POST(ev(admin, { emoji: '👍' }))
    expect(await res.json()).toEqual({ ok: true, reactions: { '👍': ['Admin'] } })
    expect(setCommentReactions).toHaveBeenCalledWith('t1', 'c1', { '👍': ['Admin'] })
  })

  it('removes the reactor when already present (toggle off)', async () => {
    vi.mocked(getTask).mockResolvedValue({ timeline: [{ kind: 'comment', id: 'c1', reactions: { '👍': ['Admin'] } }] } as never)
    const res = await POST(ev(admin, { emoji: '👍' }))
    expect(await res.json()).toEqual({ ok: true, reactions: {} })
  })

  it('404 when the comment is missing', async () => {
    vi.mocked(getTask).mockResolvedValue({ timeline: [] } as never)
    await expect(POST(ev(admin, { emoji: '👍' }))).rejects.toMatchObject({ status: 404 })
  })
})
