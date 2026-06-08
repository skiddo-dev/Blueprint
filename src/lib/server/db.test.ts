import { describe, it, expect } from 'vitest'
import { normName, resolveAdminEmailByName, retentionCutoff, expiredEmailAttachmentFilter } from './db'

// normName is the canonical form used to compare a person's name across sources
// (Entra display name vs. the "Assign to" dropdown vs. LLM-extracted text), so a
// user's own tasks still surface despite trivial casing/whitespace drift.
describe('normName', () => {
  it('lowercases and trims', () => {
    expect(normName('  Bob ')).toBe('bob')
    expect(normName('FRANK Crew')).toBe('frank crew')
  })

  it('treats null/undefined/empty as an empty string', () => {
    expect(normName(null)).toBe('')
    expect(normName(undefined)).toBe('')
    expect(normName('')).toBe('')
  })

  it('is stable for already-canonical input', () => {
    expect(normName('bob')).toBe('bob')
  })
})

// Admins granted access via ADMIN_EMAILS may have no users doc, so a name lookup
// can't resolve them. This local-part fallback is how their assignments still
// get an assignee_email — without it an admin's own tasks vanish from My Work.
describe('resolveAdminEmailByName', () => {
  const ADMINS = 'Ben@ravesinc.com, carol@ravesinc.com'

  it('maps a dropdown name to the admin email by local-part, case-insensitively', () => {
    expect(resolveAdminEmailByName('Ben', ADMINS)).toBe('ben@ravesinc.com')
    expect(resolveAdminEmailByName(' ben ', ADMINS)).toBe('ben@ravesinc.com')
    expect(resolveAdminEmailByName('CAROL', ADMINS)).toBe('carol@ravesinc.com')
  })

  it('returns null when no admin local-part matches the name', () => {
    expect(resolveAdminEmailByName('Bob', ADMINS)).toBe(null)
  })

  it('returns null for an empty name or empty/undefined admin list', () => {
    expect(resolveAdminEmailByName('', ADMINS)).toBe(null)
    expect(resolveAdminEmailByName('Ben', '')).toBe(null)
    expect(resolveAdminEmailByName('Ben', undefined)).toBe(null)
  })
})

// Retention policy: task details are kept forever, but the bytes of EMAIL
// attachments are stripped after a window (default 30 days). These two pure
// helpers encode the only risk-bearing decisions — the day math and the scoping
// that keeps the purge to email files that still hold data.
describe('retentionCutoff', () => {
  it('subtracts exactly retentionDays from now (UTC)', () => {
    const now = new Date('2026-06-08T00:00:00.000Z')
    expect(retentionCutoff(30, now)).toBe('2026-05-09T00:00:00.000Z')
    expect(retentionCutoff(1, now)).toBe('2026-06-07T00:00:00.000Z')
  })
})

describe('expiredEmailAttachmentFilter', () => {
  const cutoff = '2026-05-09T00:00:00.000Z'

  it('scopes the purge to email files that still hold data and predate the cutoff', () => {
    expect(expiredEmailAttachmentFilter(cutoff)).toEqual({
      source: 'email',
      data: { $exists: true },
      created_at: { $lt: cutoff },
    })
  })

  it('would match a 31-day-old email file but not a 29-day-old one, an upload, or an already-purged record', () => {
    // Behavioural mirror of the Mongo filter for the four cases the policy cares
    // about. Tied to the filter object above so it can't silently drift.
    const f = expiredEmailAttachmentFilter(cutoff)
    const matches = (att: Record<string, unknown>) =>
      att.source === f.source &&
      ('data' in att) === f.data.$exists &&
      typeof att.created_at === 'string' &&
      att.created_at < f.created_at.$lt

    const days = (n: number) => new Date(Date.parse(cutoff) - (n - 30) * 86_400_000).toISOString()
    expect(matches({ source: 'email', data: 'bytes', created_at: days(31) })).toBe(true)  // 31d → purge
    expect(matches({ source: 'email', data: 'bytes', created_at: days(29) })).toBe(false) // 29d → keep
    expect(matches({ source: 'upload', data: 'bytes', created_at: days(99) })).toBe(false) // upload → keep
    expect(matches({ source: 'email', created_at: days(99) })).toBe(false)                 // no data → already purged
  })
})
