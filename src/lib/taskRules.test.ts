import { describe, it, expect } from 'vitest'
import { isRealAssignee, statusOnAssign, UNASSIGNED } from './taskRules'
import { KANBAN_STATUSES } from './constants'
import type { TaskStatus } from './types'

describe('isRealAssignee', () => {
  it('is true for an actual person', () => {
    expect(isRealAssignee('Ben')).toBe(true)
  })

  it('is false for the Unassigned sentinel, blanks, and non-strings', () => {
    expect(isRealAssignee(UNASSIGNED)).toBe(false)
    expect(isRealAssignee('')).toBe(false)
    expect(isRealAssignee('   ')).toBe(false)
    expect(isRealAssignee(null)).toBe(false)
    expect(isRealAssignee(undefined)).toBe(false)
  })
})

describe('statusOnAssign', () => {
  it('promotes a "To Do" task to "In Progress" when a real person is assigned', () => {
    expect(statusOnAssign('To Do', 'Ben')).toBe('In Progress')
  })

  it('leaves the status alone when assignment is cleared', () => {
    expect(statusOnAssign('To Do', UNASSIGNED)).toBeNull()
    expect(statusOnAssign('To Do', '')).toBeNull()
  })

  it('does not touch any status other than "To Do" (no resurrecting or undoing)', () => {
    const others = KANBAN_STATUSES.filter((s): s is TaskStatus => s !== 'To Do')
    for (const s of others) {
      expect(statusOnAssign(s, 'Ben')).toBeNull()
    }
  })
})
