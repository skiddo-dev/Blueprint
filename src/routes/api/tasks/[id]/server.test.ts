import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler never touches Mongo. updateTaskField is the
// call we assert on — it must only ever fire for allowlisted fields.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  updateTaskField: vi.fn(async () => true),
  deleteTask: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { PATCH } from './+server'
import { updateTaskField } from '$lib/server/db'

// Admin session bypasses the ownership check, isolating the field-allowlist logic.
const admin = { auth: async () => ({ user: { role: 'admin' } }) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (id: string, body: unknown): any => ({
  params: { id },
  locals: admin,
  request: { json: async () => body },
})

describe('PATCH /api/tasks/[id] — field allowlist (mass-assignment guard)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes an allowlisted field', async () => {
    const res = await PATCH(ev('t1', { field: 'status', value: 'Done' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(updateTaskField).toHaveBeenCalledWith('t1', 'status', 'Done')
  })

  it.each(['created_by', 'created_at', '_id', 'role', '$where', 'needs_review'])(
    'rejects non-allowlisted field %j with 400 and never writes',
    async (field) => {
      await expect(PATCH(ev('t1', { field, value: 'x' }))).rejects.toMatchObject({ status: 400 })
      expect(updateTaskField).not.toHaveBeenCalled()
    },
  )

  it('rejects a non-string field', async () => {
    await expect(PATCH(ev('t1', { field: 123, value: 'x' }))).rejects.toMatchObject({ status: 400 })
    expect(updateTaskField).not.toHaveBeenCalled()
  })
})
