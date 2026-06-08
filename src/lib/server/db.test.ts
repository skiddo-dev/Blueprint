import { describe, it, expect } from 'vitest'
import { normName, resolveAdminEmailByName } from './db'

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
