import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  updateTaskField: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))
vi.mock('$lib/server/llm', () => ({ summarizeThread: vi.fn() }))

import { POST } from './+server'
import { getTask, updateTaskField } from '$lib/server/db'
import { summarizeThread } from '$lib/server/llm'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (id: string, locals: any): any => ({ params: { id }, locals })
const admin = sessionOf({ role: 'admin', displayName: 'Admin' })

describe('POST /api/tasks/[id]/summarize', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when unauthenticated', async () => {
    await expect(POST(ev('t1', sessionOf(null)))).rejects.toMatchObject({ status: 401 })
    expect(summarizeThread).not.toHaveBeenCalled()
  })

  it('404 when the task is missing', async () => {
    vi.mocked(getTask).mockResolvedValue(null)
    await expect(POST(ev('t1', admin))).rejects.toMatchObject({ status: 404 })
  })

  it('writes the description and returns the summary', async () => {
    vi.mocked(getTask).mockResolvedValue({
      _id: 't1', title: 'Cooler repair', full_body: 'long thread…',
      timeline: [{ kind: 'comment', text: 'Approved' }],
    } as never)
    vi.mocked(summarizeThread).mockResolvedValue('Tight summary.')

    const res = await POST(ev('t1', admin))
    expect(await res.json()).toEqual({ summary: 'Tight summary.' })
    expect(summarizeThread).toHaveBeenCalledWith(expect.objectContaining({ events: ['Approved'] }))
    expect(updateTaskField).toHaveBeenCalledWith('t1', 'description', 'Tight summary.')
  })

  it('leaves the description unchanged when the model returns null', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', title: 'x', full_body: 'y' } as never)
    vi.mocked(summarizeThread).mockResolvedValue(null)

    const res = await POST(ev('t1', admin))
    expect(await res.json()).toEqual({ summary: null })
    expect(updateTaskField).not.toHaveBeenCalled()
  })
})
