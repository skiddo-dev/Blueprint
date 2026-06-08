import { describe, it, expect } from 'vitest'
import { isOwnedBy } from './ownership'
import type { Task } from '$lib/types'

const task = (over: Partial<Task>): Task =>
  ({ _id: 't', id: 't', title: '', assigned_to: '', created_by: '', status: 'To Do', attachment_ids: [], created_at: '', ...over }) as Task

describe('isOwnedBy', () => {
  it('matches by assignee_email, case-insensitively', () => {
    expect(isOwnedBy(task({ assignee_email: 'ben@ravesinc.com' }), { email: 'Ben@RavesInc.com', name: 'whatever' })).toBe(true)
  })

  it('matches by created_by_email', () => {
    expect(isOwnedBy(task({ created_by_email: 'ben@ravesinc.com' }), { email: 'ben@ravesinc.com' })).toBe(true)
  })

  it('does NOT fall back to name once the task carries an identity', () => {
    // The regression: assigned_to holds the dropdown name ("Ben"), but the
    // user's displayName is their email-derived handle. Email is authoritative.
    const t = task({ assignee_email: 'ben@ravesinc.com', assigned_to: 'Ben' })
    expect(isOwnedBy(t, { email: 'someone-else@x.com', name: 'Ben' })).toBe(false)
  })

  it('this is the bug: a name-only check would miss a task that is mine by email', () => {
    // displayName ("ben@ravesinc.com") != assigned_to ("Ben"), so the old
    // name-only filter returned false; identity rescues it.
    const mine = task({ assigned_to: 'Ben', assignee_email: 'ben@ravesinc.com' })
    expect(isOwnedBy(mine, { email: 'ben@ravesinc.com', name: 'ben@ravesinc.com' })).toBe(true)
  })

  it('falls back to a name match (assigned_to OR created_by) for un-backfilled tasks', () => {
    expect(isOwnedBy(task({ assigned_to: 'Bob' }), { name: ' bob ' })).toBe(true)
    expect(isOwnedBy(task({ created_by: 'Bob' }), { name: 'bob' })).toBe(true)
  })

  it('an empty identity owns nothing', () => {
    expect(isOwnedBy(task({ assigned_to: '' }), { email: '', name: '' })).toBe(false)
    expect(isOwnedBy(task({ assignee_email: 'ben@x.com' }), { email: '', name: '' })).toBe(false)
  })
})
