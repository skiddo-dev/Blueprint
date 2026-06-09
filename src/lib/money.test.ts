import { describe, it, expect } from 'vitest'
import {
  cents, fromDollars, parseMoney, sum, add, sub, negate, mul, allocate, format, toDollars,
} from './money'

describe('cents', () => {
  it('brands a safe integer', () => {
    expect(cents(1230)).toBe(1230)
    expect(cents(0)).toBe(0)
    expect(cents(-500)).toBe(-500)
  })
  it('rejects non-integers and unsafe values', () => {
    expect(() => cents(12.5)).toThrow(RangeError)
    expect(() => cents(NaN)).toThrow(RangeError)
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError)
  })
})

describe('fromDollars', () => {
  it('converts dollars to cents, rounding to the penny', () => {
    expect(fromDollars(12.3)).toBe(1230)
    expect(fromDollars(0)).toBe(0)
    expect(fromDollars(0.1)).toBe(10)
    // The classic float trap: 0.1 + 0.2 === 0.30000000000000004, but the cents are exact.
    expect(add(fromDollars(0.1), fromDollars(0.2))).toBe(fromDollars(0.3))
  })
  it('rounds to the nearest cent, symmetrically for negatives', () => {
    expect(fromDollars(1.006)).toBe(101)   // .6¢ rounds up
    expect(fromDollars(1.004)).toBe(100)   // .4¢ rounds down
    expect(fromDollars(-1.006)).toBe(-101) // symmetric for negatives
    expect(fromDollars(-1.004)).toBe(-100)
    expect(fromDollars(-12.3)).toBe(-1230)
  })
  it('shows why money must be integer cents: the float 1.005 is really 1.00499…', () => {
    // 1.005 can't be represented exactly, so it rounds DOWN — the exact class of
    // error a double-entry ledger can't tolerate, which is why amounts are cents.
    expect(fromDollars(1.005)).toBe(100)
  })
  it('rejects non-finite input', () => {
    expect(() => fromDollars(Infinity)).toThrow(RangeError)
    expect(() => fromDollars(NaN)).toThrow(RangeError)
  })
})

describe('parseMoney', () => {
  it('strips $ and thousands separators', () => {
    expect(parseMoney('$12,300.50')).toBe(1230050)
    expect(parseMoney('1,234')).toBe(123400)
    expect(parseMoney('5')).toBe(500)
  })
  it('treats parentheses as a negative (accounting convention)', () => {
    expect(parseMoney('($45.00)')).toBe(-4500)
    expect(parseMoney('(1,000)')).toBe(-100000)
  })
  it('handles a leading minus and a numeric argument', () => {
    expect(parseMoney('-5')).toBe(-500)
    expect(parseMoney(12.3)).toBe(1230)
  })
  it('throws on empty / non-numeric input', () => {
    expect(() => parseMoney('')).toThrow()
    expect(() => parseMoney('abc')).toThrow()
  })
})

describe('arithmetic helpers', () => {
  it('sum / add / sub / negate', () => {
    expect(sum([cents(100), cents(200), cents(-50)])).toBe(250)
    expect(sum([])).toBe(0)
    expect(add(cents(100), cents(25))).toBe(125)
    expect(sub(cents(100), cents(25))).toBe(75)
    expect(negate(cents(100))).toBe(-100)
  })
})

describe('mul', () => {
  it('applies a rate and rounds to the penny', () => {
    expect(mul(cents(10000), 0.06)).toBe(600)     // 6% of $100.00
    expect(mul(cents(333), 3)).toBe(999)
    expect(mul(cents(101), 0.5)).toBe(51)          // 50.5 → 51 (half away from zero)
    expect(mul(cents(-101), 0.5)).toBe(-51)
  })
  it('rejects a non-finite factor', () => {
    expect(() => mul(cents(100), Infinity)).toThrow(RangeError)
  })
})

describe('allocate', () => {
  it('splits with no lost pennies — parts always sum to the total', () => {
    const parts = allocate(cents(1000), [1, 1, 1])      // $10.00 three ways
    expect(parts).toEqual([334, 333, 333])
    expect(sum(parts)).toBe(1000)
  })
  it('apportions by weight', () => {
    const parts = allocate(cents(10000), [3, 1])         // 75% / 25% of $100
    expect(parts).toEqual([7500, 2500])
    expect(sum(parts)).toBe(10000)
  })
  it('gives leftover cents to the largest remainders, earliest-index on ties', () => {
    // 100 split 3 ways: exact 33.33 each, 1 leftover cent → first index.
    expect(allocate(cents(100), [1, 1, 1])).toEqual([34, 33, 33])
  })
  it('handles a single weight and a zero total', () => {
    expect(allocate(cents(999), [5])).toEqual([999])
    expect(allocate(cents(0), [1, 2, 3])).toEqual([0, 0, 0])
  })
  it('rejects bad inputs', () => {
    expect(() => allocate(cents(-1), [1])).toThrow(RangeError)
    expect(() => allocate(cents(100), [])).toThrow(RangeError)
    expect(() => allocate(cents(100), [0, 0])).toThrow(RangeError)
    expect(() => allocate(cents(100), [1, -1])).toThrow(RangeError)
  })
})

describe('format / toDollars', () => {
  it('formats cents as USD', () => {
    expect(format(cents(1230))).toBe('$12.30')
    expect(format(cents(0))).toBe('$0.00')
    expect(format(cents(-4500))).toBe('-$45.00')
    expect(format(cents(123456789))).toBe('$1,234,567.89')
  })
  it('toDollars is the plain decimal', () => {
    expect(toDollars(cents(1230))).toBe(12.3)
  })
})
