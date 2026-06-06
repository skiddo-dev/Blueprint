import { describe, it, expect } from 'vitest'
import { extractStoreNumbers, normalizeStoreNumbers } from './storeNumbers'

describe('extractStoreNumbers', () => {
  it('returns [] for empty / falsy input', () => {
    expect(extractStoreNumbers('')).toEqual([])
    // The function guards on falsy input before touching .matchAll.
    expect(extractStoreNumbers(undefined as unknown as string)).toEqual([])
  })

  it('matches the explicit "D-###", "D ###", "D###" forms (case-insensitive)', () => {
    expect(extractStoreNumbers('D-412')).toEqual(['412'])
    expect(extractStoreNumbers('D 412')).toEqual(['412'])
    expect(extractStoreNumbers('D412')).toEqual(['412'])
    expect(extractStoreNumbers('d412')).toEqual(['412'])
  })

  it('matches a bare 3-digit store number in title text', () => {
    expect(extractStoreNumbers('Store 412 remodel')).toEqual(['412'])
  })

  it('de-duplicates and sorts the results', () => {
    expect(extractStoreNumbers('D-412 and store 412')).toEqual(['412'])
    expect(extractStoreNumbers('D412, D-118, store 305')).toEqual(['118', '305', '412'])
  })

  it('ignores dollar amounts and numbers glued to other digits', () => {
    expect(extractStoreNumbers('$412')).toEqual([])      // preceded by "$"
    expect(extractStoreNumbers('1,412')).toEqual([])     // preceded by ","
    expect(extractStoreNumbers('41234')).toEqual([])     // part of a longer number
    expect(extractStoreNumbers('Quote is $12,300')).toEqual([])
  })

  it('pulls the explicit D-store even when a dollar amount is present', () => {
    expect(extractStoreNumbers('D-412 quote $12,300')).toEqual(['412'])
  })
})

describe('normalizeStoreNumbers', () => {
  it('reduces arbitrary values to clean 3-digit strings', () => {
    expect(normalizeStoreNumbers(['D-412', '118', 'abc'])).toEqual(['118', '412'])
  })

  it('de-duplicates and sorts', () => {
    expect(normalizeStoreNumbers(['412', '412', '118'])).toEqual(['118', '412'])
  })

  it('coerces non-string values and drops those without a 3-digit run', () => {
    expect(normalizeStoreNumbers([412, null, undefined, '', 'xx'])).toEqual(['412'])
  })

  it('returns [] for an empty list', () => {
    expect(normalizeStoreNumbers([])).toEqual([])
  })
})
