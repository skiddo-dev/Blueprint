import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Task } from '$lib/types'

// Mock the db + Graph layers so the cutoff logic is tested in isolation (no Mongo,
// no Microsoft 365). The cutoff math (syncLogic) is left REAL so we exercise it.
const getTasksMock = vi.hoisted(() => vi.fn())
const deleteTaskMock = vi.hoisted(() => vi.fn())
const getTokenMock = vi.hoisted(() => vi.fn())
const fetchDateMock = vi.hoisted(() => vi.fn())

vi.mock('./db', () => ({
  getTasks: getTasksMock,
  deleteTask: deleteTaskMock,
  tryAcquireLease: vi.fn().mockResolvedValue(true),
  releaseLease: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./email', () => {
  class GraphAuthError extends Error {}
  return { GraphAuthError, getGraphToken: getTokenMock, fetchMessageReceivedDate: fetchDateMock }
})

import { backfillCutoff } from './backfillCutoff'
import { GraphAuthError } from './email'

const CUTOFF = '2026-06-08T00:00:00-04:00'

function task(p: Partial<Task>): Task {
  return {
    _id: 'x', id: 'x', title: 't', assigned_to: 'a', status: 'To Do',
    created_by: 's', attachment_ids: [], created_at: '2026-01-01', ...p,
  } as Task
}

beforeEach(() => {
  getTasksMock.mockReset()
  deleteTaskMock.mockReset().mockResolvedValue(true)
  getTokenMock.mockReset().mockResolvedValue('tok')
  fetchDateMock.mockReset()
})

describe('backfillCutoff', () => {
  // a = pre-cutoff (removable), b = post-cutoff (kept), c = manual card (ignored).
  const withStoredDates = () => [
    task({ _id: 'a', exchange_id: 'x1', email_date: '2026-06-01T00:00:00Z' }),
    task({ _id: 'b', exchange_id: 'x2', email_date: '2026-06-09T00:00:00Z' }),
    task({ _id: 'c', email_date: '2026-01-01T00:00:00Z' }),
  ]

  it('dry run counts removable cards without deleting or calling Graph', async () => {
    getTasksMock.mockResolvedValue(withStoredDates())

    const r = await backfillCutoff({ dryRun: true, cutoff: CUTOFF })

    expect(r).toMatchObject({ scanned: 3, synced: 2, removed: 1, kept: 1, unverifiable: 0, dryRun: true })
    expect(deleteTaskMock).not.toHaveBeenCalled()
    expect(getTokenMock).not.toHaveBeenCalled() // every candidate had a stored email_date
  })

  it('permanently deletes only the pre-cutoff card, ignoring manual (no exchange_id) cards', async () => {
    getTasksMock.mockResolvedValue(withStoredDates())

    const r = await backfillCutoff({ cutoff: CUTOFF })

    expect(r).toMatchObject({ synced: 2, removed: 1, kept: 1, unverifiable: 0, dryRun: false })
    expect(deleteTaskMock).toHaveBeenCalledTimes(1)
    expect(deleteTaskMock).toHaveBeenCalledWith('a')
  })

  it('re-fetches the date from Graph when a card has no stored email_date', async () => {
    getTasksMock.mockResolvedValue([task({ _id: 'a', exchange_id: 'x1', source_mailbox: 'pm@x.com' })])
    fetchDateMock.mockResolvedValue('2026-06-01T00:00:00Z') // pre-cutoff

    const r = await backfillCutoff({ cutoff: CUTOFF })

    expect(getTokenMock).toHaveBeenCalledTimes(1)
    expect(fetchDateMock).toHaveBeenCalledWith('pm@x.com', 'x1', 'tok')
    expect(r).toMatchObject({ removed: 1, unverifiable: 0 })
    expect(deleteTaskMock).toHaveBeenCalledWith('a')
  })

  it('leaves a card untouched when its date cannot be determined (message gone)', async () => {
    getTasksMock.mockResolvedValue([task({ _id: 'a', exchange_id: 'x1', source_mailbox: 'pm@x.com' })])
    fetchDateMock.mockResolvedValue(null)

    const r = await backfillCutoff({ cutoff: CUTOFF })

    expect(r).toMatchObject({ removed: 0, kept: 0, unverifiable: 1 })
    expect(deleteTaskMock).not.toHaveBeenCalled()
  })

  it('aborts and deletes nothing when Microsoft sign-in fails', async () => {
    getTasksMock.mockResolvedValue([task({ _id: 'a', exchange_id: 'x1', source_mailbox: 'pm@x.com' })])
    getTokenMock.mockRejectedValue(new GraphAuthError('expired secret'))

    const r = await backfillCutoff({ cutoff: CUTOFF })

    expect(r).toMatchObject({ authError: true, removed: 0 })
    expect(deleteTaskMock).not.toHaveBeenCalled()
  })
})
