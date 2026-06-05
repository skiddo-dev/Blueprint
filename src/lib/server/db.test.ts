import { describe, it, expect } from 'vitest'
import { normName } from './db'

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
