import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  addChecklistItem: vi.fn(async () => true),
}))
vi.mock('$lib/server/authz', () => ({
  assertCanAccessTask: vi.fn(async () => {}),
}))

import { POST } from './+server'
import { addChecklistItem } from '$lib/server/db'

const admin = { auth: async () => ({ user: { role: 'admin', displayName: 'Bob' } }) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (id: string, body: unknown): any => ({ params: { id }, locals: admin, request: { json: async () => body } })

describe('POST /api/tasks/[id]/checklist', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a trimmed item with a server-generated id, not done', async () => {
    const res = await POST(ev('t1', { text: '  hang the door  ' }))
    expect(res.status).toBe(201)
    const { item } = await res.json()
    expect(item).toMatchObject({ text: 'hang the door', done: false })
    expect(item.id).toMatch(/[0-9a-f-]{36}/)
    expect(addChecklistItem).toHaveBeenCalledWith('t1', item)
  })

  it('caps the text length at 300', async () => {
    const res = await POST(ev('t1', { text: 'x'.repeat(900) }))
    const { item } = await res.json()
    expect(item.text).toHaveLength(300)
  })

  it('rejects empty / non-string text', async () => {
    await expect(POST(ev('t1', { text: '   ' }))).rejects.toMatchObject({ status: 400 })
    await expect(POST(ev('t1', { text: 42 }))).rejects.toMatchObject({ status: 400 })
    expect(addChecklistItem).not.toHaveBeenCalled()
  })

  it('404s when the task vanished', async () => {
    vi.mocked(addChecklistItem).mockResolvedValueOnce(false)
    await expect(POST(ev('gone', { text: 'x' }))).rejects.toMatchObject({ status: 404 })
  })
})
