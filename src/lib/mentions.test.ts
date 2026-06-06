import { describe, it, expect } from 'vitest'
import { parseMentions } from './mentions'

const ROSTER = ['Ben', 'Kris', 'Bob', 'Frank Crew', 'Bogdan']

describe('parseMentions', () => {
  it('matches a single mention', () => {
    expect(parseMentions('hey @Ben can you look?', ROSTER)).toEqual(['Ben'])
  })

  it('matches multiple mentions in appearance order', () => {
    expect(parseMentions('@Kris and @Ben please', ROSTER)).toEqual(['Kris', 'Ben'])
  })

  it('resolves a first-word token to a multi-word name', () => {
    expect(parseMentions('@Frank owns this', ROSTER)).toEqual(['Frank Crew'])
  })

  it('is case-insensitive', () => {
    expect(parseMentions('ping @ben and @FRANK', ROSTER)).toEqual(['Ben', 'Frank Crew'])
  })

  it('ignores unknown @names', () => {
    expect(parseMentions('@Nobody @Ben', ROSTER)).toEqual(['Ben'])
  })

  it('de-dupes repeated mentions', () => {
    expect(parseMentions('@Ben @Ben @ben', ROSTER)).toEqual(['Ben'])
  })

  it('does not treat an email address as a mention', () => {
    expect(parseMentions('email bob@example.com', ROSTER)).toEqual([])
  })

  it('returns [] for empty text or no candidates', () => {
    expect(parseMentions('', ROSTER)).toEqual([])
    expect(parseMentions('@Ben', [])).toEqual([])
  })
})
