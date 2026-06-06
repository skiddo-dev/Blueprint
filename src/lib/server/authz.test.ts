import { describe, it, expect } from 'vitest'
import { canAccessTask } from './authz'
import type { Task } from '$lib/types'

const task = (over: Partial<Task>): Task =>
  ({ _id: 't', id: 't', title: '', assigned_to: '', created_by: '', status: 'To Do', attachment_ids: [], created_at: '', ...over }) as Task

describe('canAccessTask', () => {
  it('admins can access anything', () => {
    expect(canAccessTask({ role: 'admin' }, task({ created_by_email: 'a@x.com' }))).toBe(true)
  })

  it('grants by created_by_email, case-insensitively', () => {
    expect(canAccessTask({ role: 'pm', email: 'Bob@X.com' }, task({ created_by_email: 'bob@x.com' }))).toBe(true)
  })

  it('grants by assignee_email', () => {
    expect(canAccessTask({ role: 'pm', email: 'bob@x.com' }, task({ assignee_email: 'bob@x.com' }))).toBe(true)
  })

  it('identity is authoritative: a name match does NOT grant access once emails are set', () => {
    const t = task({ created_by_email: 'alice@x.com', created_by: 'Bob', assigned_to: 'Bob' })
    expect(canAccessTask({ role: 'pm', email: 'bob@x.com', displayName: 'Bob' }, t)).toBe(false)
  })

  it('falls back to a legacy name match when the task has no identity', () => {
    expect(canAccessTask({ role: 'pm', displayName: ' bob ' }, task({ assigned_to: 'Bob' }))).toBe(true)
  })

  it('denies a non-owner', () => {
    expect(canAccessTask({ role: 'pm', email: 'eve@x.com', displayName: 'Eve' }, task({ created_by_email: 'bob@x.com' }))).toBe(false)
  })
})
