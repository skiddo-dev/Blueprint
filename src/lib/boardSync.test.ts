import { describe, it, expect } from 'vitest'
import { remoteChangedIds, LOCAL_EDIT_GRACE_MS } from './boardSync'
import type { Task } from './types'

const NOW = 1_750_000_000_000
const t = (id: string, updated: string): Task =>
  ({ _id: id, id, title: id, status: 'To Do', assigned_to: '', created_by: '', attachment_ids: [], created_at: '', updated_at: updated }) as Task

describe('remoteChangedIds', () => {
  it('flags cards whose updated_at moved and brand-new cards', () => {
    const prev = [t('a', '1'), t('b', '1')]
    const fresh = [t('a', '2'), t('b', '1'), t('c', '1')]
    expect(remoteChangedIds(prev, fresh, new Map(), NOW)).toEqual(['a', 'c'])
  })

  it('stays quiet when nothing changed', () => {
    const prev = [t('a', '1')]
    expect(remoteChangedIds(prev, [t('a', '1')], new Map(), NOW)).toEqual([])
  })

  it('does not flash your own recent edits back at you', () => {
    const prev = [t('a', '1')]
    const fresh = [t('a', '2')]
    const mine = new Map([['a', NOW - 1000]])
    expect(remoteChangedIds(prev, fresh, mine, NOW)).toEqual([])
  })

  it('a stale local-edit record no longer suppresses the flash', () => {
    const prev = [t('a', '1')]
    const fresh = [t('a', '2')]
    const old = new Map([['a', NOW - LOCAL_EDIT_GRACE_MS - 1]])
    expect(remoteChangedIds(prev, fresh, old, NOW)).toEqual(['a'])
  })

  it('removed cards do not appear (nothing left to flash)', () => {
    const prev = [t('a', '1'), t('b', '1')]
    expect(remoteChangedIds(prev, [t('a', '1')], new Map(), NOW)).toEqual([])
  })
})
