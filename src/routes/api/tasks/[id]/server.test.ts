import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler never touches Mongo. updateTaskField is the
// call we assert on — it must only ever fire for allowlisted fields.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  updateTaskField: vi.fn(async () => true),
  patchTask: vi.fn(async () => true),
  getUserEmailByName: vi.fn(async () => 'dana@x.com'),
  deleteTask: vi.fn(async () => true),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { PATCH } from './+server'
import { updateTaskField, patchTask, getUserEmailByName, getTask } from '$lib/server/db'

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

  it('rejects an invalid value for an allowlisted field', async () => {
    await expect(PATCH(ev('t1', { field: 'status', value: 'Nonsense' }))).rejects.toMatchObject({ status: 400 })
    expect(updateTaskField).not.toHaveBeenCalled()
  })

  it('reassigning refreshes assignee identity (patchTask with resolved email)', async () => {
    const res = await PATCH(ev('t1', { field: 'assigned_to', value: 'Dana' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(getUserEmailByName).toHaveBeenCalledWith('Dana')
    expect(patchTask).toHaveBeenCalledWith('t1', { assigned_to: 'Dana', assignee_email: 'dana@x.com' })
    expect(updateTaskField).not.toHaveBeenCalled()
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

describe('PATCH /api/tasks/[id] — assigning starts the task', () => {
  beforeEach(() => vi.clearAllMocks())

  it('promotes a "To Do" task to "In Progress" when a real person is assigned', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'To Do' } as never)
    const res = await PATCH(ev('t1', { field: 'assigned_to', value: 'Dana' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(patchTask).toHaveBeenCalledWith('t1', {
      assigned_to: 'Dana',
      assignee_email: 'dana@x.com',
      status: 'In Progress',
    })
  })

  it('leaves a non-"To Do" status alone on reassignment (no resurrecting/undoing)', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'Done' } as never)
    await PATCH(ev('t1', { field: 'assigned_to', value: 'Dana' }))
    expect(patchTask).toHaveBeenCalledWith('t1', { assigned_to: 'Dana', assignee_email: 'dana@x.com' })
  })

  it('does not start the task when the assignment is cleared to Unassigned', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'To Do' } as never)
    await PATCH(ev('t1', { field: 'assigned_to', value: 'Unassigned' }))
    expect(patchTask).toHaveBeenCalledWith('t1', { assigned_to: 'Unassigned', assignee_email: 'dana@x.com' })
  })
})
