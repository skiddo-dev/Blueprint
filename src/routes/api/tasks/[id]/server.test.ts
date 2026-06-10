import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler never touches Mongo. updateTaskField is the
// call we assert on — it must only ever fire for allowlisted fields.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  updateTaskField: vi.fn(async () => true),
  patchTask: vi.fn(async () => true),
  getUserEmailByName: vi.fn(async () => 'dana@x.com'),
  deleteTask: vi.fn(async () => true),
  resolveCoAssignees: vi.fn(async () => ({ co_assignees: [], co_assignee_emails: [] })),
  topRankForStatus: vi.fn(async () => 'top1'),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { PATCH } from './+server'
import { updateTaskField, patchTask, getUserEmailByName, getTask, resolveCoAssignees } from '$lib/server/db'

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
    const res = await PATCH(ev('t1', { field: 'notes', value: 'call the vendor' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(updateTaskField).toHaveBeenCalledWith('t1', 'notes', 'call the vendor')
  })

  it('a status edit stamps the aging clock only when the column actually changes', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'To Do' } as never)
    const res = await PATCH(ev('t1', { field: 'status', value: 'Done' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(patchTask).toHaveBeenCalledWith('t1', {
      status: 'Done',
      status_changed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      rank: 'top1', // a dropdown move lands the card at the top of its new column
    }, undefined, undefined)

    // Re-selecting the same status must NOT reset status_changed_at — a stale
    // card would suddenly look fresh to the aging signal.
    vi.clearAllMocks()
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'Done' } as never)
    await PATCH(ev('t1', { field: 'status', value: 'Done' }))
    expect(patchTask).toHaveBeenCalledWith('t1', { status: 'Done' }, undefined, undefined)
  })

  it('a status change restores an archived card (clears archived_at)', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'Done', archived_at: '2026-05-01T00:00:00Z' } as never)
    await PATCH(ev('t1', { field: 'status', value: 'To Do' }))
    expect(patchTask).toHaveBeenCalledWith('t1', {
      status: 'To Do',
      status_changed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      rank: 'top1',
    }, undefined, ['archived_at'])
  })

  it('rejects an invalid value for an allowlisted field', async () => {
    await expect(PATCH(ev('t1', { field: 'status', value: 'Nonsense' }))).rejects.toMatchObject({ status: 400 })
    expect(updateTaskField).not.toHaveBeenCalled()
  })

  it('reassigning refreshes assignee identity (patchTask with resolved email)', async () => {
    // Explicit: no current task → no auto-start side effects (and no reliance
    // on whichever getTask implementation an earlier test left behind).
    vi.mocked(getTask).mockResolvedValue(null as never)
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
      // Auto-start is a column change: aging clock restarts, card surfaces at
      // the top of In Progress.
      status_changed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      rank: 'top1',
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

describe('PATCH /api/tasks/[id] — co-assignees (multi-person assignment)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes the resolved co-assignee list + identities via patchTask', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'In Progress', assigned_to: 'Dana' } as never)
    vi.mocked(resolveCoAssignees).mockResolvedValue({ co_assignees: ['Ben'], co_assignee_emails: ['ben@x.com'] })
    const res = await PATCH(ev('t1', { field: 'co_assignees', value: ['Ben'] }))
    expect(await res.json()).toEqual({ ok: true })
    expect(resolveCoAssignees).toHaveBeenCalledWith(['Ben'], 'Dana')
    expect(patchTask).toHaveBeenCalledWith('t1', { co_assignees: ['Ben'], co_assignee_emails: ['ben@x.com'] })
    expect(updateTaskField).not.toHaveBeenCalled()
  })

  it('rejects a non-array co_assignees value', async () => {
    await expect(PATCH(ev('t1', { field: 'co_assignees', value: 'Ben' }))).rejects.toMatchObject({ status: 400 })
    expect(patchTask).not.toHaveBeenCalled()
  })

  it('promoting a co-assignee to primary re-resolves the co-list against the new primary', async () => {
    vi.mocked(getTask).mockResolvedValue({ _id: 't1', status: 'Done', co_assignees: ['Dana', 'Ben'] } as never)
    vi.mocked(resolveCoAssignees).mockResolvedValue({ co_assignees: ['Ben'], co_assignee_emails: [] })
    await PATCH(ev('t1', { field: 'assigned_to', value: 'Dana' }))
    expect(resolveCoAssignees).toHaveBeenCalledWith(['Dana', 'Ben'], 'Dana')
    expect(patchTask).toHaveBeenCalledWith('t1', {
      assigned_to: 'Dana',
      assignee_email: 'dana@x.com',
      co_assignees: ['Ben'],
      co_assignee_emails: [],
    })
  })
})
