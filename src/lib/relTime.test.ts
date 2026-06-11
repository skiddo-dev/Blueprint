import { describe, it, expect } from 'vitest'
import { relTime } from './relTime'

describe('relTime', () => {
  const now = Date.parse('2026-06-11T12:00:00Z')

  it('says "just now" under a minute (including a slightly-future clock skew)', () => {
    expect(relTime('2026-06-11T11:59:30Z', now)).toBe('just now')
    expect(relTime('2026-06-11T12:00:05Z', now)).toBe('just now')
  })

  it('minutes, then hours', () => {
    expect(relTime('2026-06-11T11:56:00Z', now)).toBe('4m ago')
    expect(relTime('2026-06-11T09:00:00Z', now)).toBe('3h ago')
    expect(relTime('2026-06-10T13:00:00Z', now)).toBe('23h ago')
  })

  it('falls back to a short date at a day or more', () => {
    expect(relTime('2026-06-09T12:00:00Z', now)).toMatch(/^Jun \d+$/)
  })

  it('returns empty for missing/garbled input', () => {
    expect(relTime(null, now)).toBe('')
    expect(relTime(undefined, now)).toBe('')
    expect(relTime('not-a-date', now)).toBe('')
  })
})
