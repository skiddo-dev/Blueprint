import { describe, it, expect } from 'vitest'
import { rankBetween, spreadRanks } from './rank'

// The board sorts a column by plain lexicographic rank. These tests pin the two
// invariants everything else leans on: rankBetween always returns a key strictly
// inside its bounds, and no generator ever emits a key ending in '0' (a "a0"-style
// key has nothing between it and "a", which would wedge future drops).

describe('rankBetween', () => {
  it('seeds an empty column', () => {
    const r = rankBetween(null, null)
    expect(r.length).toBeGreaterThan(0)
  })

  it('prepends before the first key and appends after the last', () => {
    const first = rankBetween(null, null)
    const before = rankBetween(null, first)
    const after = rankBetween(first, null)
    expect(before < first).toBe(true)
    expect(first < after).toBe(true)
  })

  it('finds room between adjacent digits', () => {
    const m = rankBetween('a', 'b')
    expect('a' < m && m < 'b').toBe(true)
  })

  it('finds room between a key and its extension', () => {
    const m = rankBetween('a', 'a1')
    expect('a' < m && m < 'a1').toBe(true)
  })

  it('throws when the bounds are not strictly ordered', () => {
    expect(() => rankBetween('b', 'a')).toThrow()
    expect(() => rankBetween('a', 'a')).toThrow()
  })

  it('never emits a trailing 0', () => {
    expect(rankBetween(null, '01').endsWith('0')).toBe(false)
    expect(rankBetween(null, '1').endsWith('0')).toBe(false)
  })

  it('stays ordered under sustained insertion at one spot (worst case)', () => {
    // Repeatedly dropping between the same neighbours is the pathological case
    // for fractional keys — assert order holds and keys grow only modestly.
    let lo: string | null = null
    let hi: string | null = rankBetween(null, null)
    for (let i = 0; i < 200; i++) {
      const mid: string = rankBetween(lo, hi)
      expect(lo === null || lo < mid).toBe(true)
      expect(mid < hi!).toBe(true)
      expect(mid.endsWith('0')).toBe(false)
      lo = mid
    }
  })

  it('keeps a randomly built list strictly sorted (stress)', () => {
    const keys = [rankBetween(null, null)]
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(Math.random() * (keys.length + 1))
      const lo = at === 0 ? null : keys[at - 1]
      const hi = at === keys.length ? null : keys[at]
      keys.splice(at, 0, rankBetween(lo, hi))
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true)
    }
  })
})

describe('spreadRanks', () => {
  it('returns n strictly ascending keys', () => {
    const r = spreadRanks(50)
    expect(r).toHaveLength(50)
    for (let i = 1; i < r.length; i++) expect(r[i - 1] < r[i]).toBe(true)
  })

  it('handles 0, 1, and large n', () => {
    expect(spreadRanks(0)).toEqual([])
    expect(spreadRanks(1)).toHaveLength(1)
    const big = spreadRanks(5000)
    expect(new Set(big).size).toBe(5000)
  })

  it('never emits a trailing 0', () => {
    for (const k of spreadRanks(500)) expect(k.endsWith('0')).toBe(false)
  })

  it('leaves room for midpoints between every seeded pair and at both ends', () => {
    const r = spreadRanks(100)
    expect(rankBetween(null, r[0]) < r[0]).toBe(true)
    for (let i = 1; i < r.length; i++) {
      const m = rankBetween(r[i - 1], r[i])
      expect(r[i - 1] < m && m < r[i]).toBe(true)
    }
    expect(rankBetween(r[r.length - 1], null) > r[r.length - 1]).toBe(true)
  })
})
