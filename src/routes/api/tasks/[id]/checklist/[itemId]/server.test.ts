import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  setChecklistItem: vi.fn(async () => true),
  deleteChecklistItem: vi.fn(async () => true),
}))
vi.mock('$lib/server/authz', () => ({
  assertCanAccessTask: vi.fn(async () => {}),
}))

import { PATCH, DELETE } from './+server'
import { setChecklistItem, deleteChecklistItem } from '$lib/server/db'

const admin = { auth: async () => ({ user: { role: 'admin', displayName: 'Bob' } }) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (body?: unknown): any => ({
  params: { id: 't1', itemId: 'i1' },
  locals: admin,
  request: { json: async () => body },
})

describe('PATCH /api/tasks/[id]/checklist/[itemId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('checking an item stamps who did it', async () => {
    const res = await PATCH(ev({ done: true }))
    expect(await res.json()).toEqual({ ok: true })
    expect(setChecklistItem).toHaveBeenCalledWith('t1', 'i1', { done: true, doneBy: 'Bob' })
  })

  it('unchecking goes through the same path (the db layer clears the stamp)', async () => {
    await PATCH(ev({ done: false }))
    expect(setChecklistItem).toHaveBeenCalledWith('t1', 'i1', { done: false, doneBy: 'Bob' })
  })

  it('retitles an item', async () => {
    await PATCH(ev({ text: '  new wording  ' }))
    expect(setChecklistItem).toHaveBeenCalledWith('t1', 'i1', { text: 'new wording' })
  })

  it('rejects an empty patch and bad field types', async () => {
    await expect(PATCH(ev({}))).rejects.toMatchObject({ status: 400 })
    await expect(PATCH(ev({ done: 'yes' }))).rejects.toMatchObject({ status: 400 })
    await expect(PATCH(ev({ text: '' }))).rejects.toMatchObject({ status: 400 })
    expect(setChecklistItem).not.toHaveBeenCalled()
  })

  it('404s when the item is gone', async () => {
    vi.mocked(setChecklistItem).mockResolvedValueOnce(false)
    await expect(PATCH(ev({ done: true }))).rejects.toMatchObject({ status: 404 })
  })
})

describe('DELETE /api/tasks/[id]/checklist/[itemId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes the item', async () => {
    const res = await DELETE(ev())
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteChecklistItem).toHaveBeenCalledWith('t1', 'i1')
  })

  it('404s when nothing was removed', async () => {
    vi.mocked(deleteChecklistItem).mockResolvedValueOnce(false)
    await expect(DELETE(ev())).rejects.toMatchObject({ status: 404 })
  })
})
