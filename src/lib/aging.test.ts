import { describe, it, expect } from 'vitest'
import { daysInColumn, agingLevel } from './aging'
import { AGING_THRESHOLDS } from './constants'

const NOW = new Date('2026-06-10T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const t = (status: string, statusChangedDaysAgo: number) => ({
  status: status as never,
  status_changed_at: daysAgo(statusChangedDaysAgo),
  created_at: daysAgo(90),
})

describe('daysInColumn', () => {
  it('counts whole days since status_changed_at', () => {
    expect(daysInColumn(t('To Do', 0), NOW)).toBe(0)
    expect(daysInColumn(t('To Do', 3), NOW)).toBe(3)
    expect(daysInColumn(t('To Do', 14), NOW)).toBe(14)
  })

  it('falls back to created_at when status_changed_at is missing (pre-backfill docs)', () => {
    const legacy = { status: 'To Do' as never, status_changed_at: undefined, created_at: daysAgo(10) }
    expect(daysInColumn(legacy, NOW)).toBe(10)
  })

  it('is 0 for unparseable dates and never negative', () => {
    expect(daysInColumn({ status: 'To Do' as never, status_changed_at: 'garbage', created_at: 'garbage' }, NOW)).toBe(0)
    expect(daysInColumn(t('To Do', -2), NOW)).toBe(0) // clock skew: stamped in the future
  })
})

describe('agingLevel', () => {
  it('thresholds: none below warn, warn at warnDays, alert at alertDays', () => {
    expect(agingLevel(t('In Progress', AGING_THRESHOLDS.warnDays - 1), NOW)).toBe('none')
    expect(agingLevel(t('In Progress', AGING_THRESHOLDS.warnDays), NOW)).toBe('warn')
    expect(agingLevel(t('In Progress', AGING_THRESHOLDS.alertDays - 1), NOW)).toBe('warn')
    expect(agingLevel(t('In Progress', AGING_THRESHOLDS.alertDays), NOW)).toBe('alert')
    expect(agingLevel(t('In Progress', 60), NOW)).toBe('alert')
  })

  it('ages every active column', () => {
    for (const s of ['To Do', 'In Progress', 'Review']) {
      expect(agingLevel(t(s, 30), NOW)).toBe('alert')
    }
  })

  it('never flags terminal or parked columns', () => {
    for (const s of ['Done', 'Cancelled', 'On Hold']) {
      expect(agingLevel(t(s, 300), NOW)).toBe('none')
    }
  })
})
