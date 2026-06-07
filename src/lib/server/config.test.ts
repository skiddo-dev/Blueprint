import { describe, it, expect } from 'vitest'
import { missingProdEnv, REQUIRED_PROD_ENV, requireInProd } from './config'

describe('missingProdEnv', () => {
  it('returns [] when every required var is present', () => {
    const env = Object.fromEntries(REQUIRED_PROD_ENV.map((k) => [k, 'x'])) as Record<string, string>
    expect(missingProdEnv((k) => env[k])).toEqual([])
  })

  it('reports missing and blank (whitespace-only) vars', () => {
    const env = Object.fromEntries(REQUIRED_PROD_ENV.map((k) => [k, 'x'])) as Record<string, string | undefined>
    env.AUTH_SECRET = undefined
    env.MONGODB_URI = '   '
    expect(missingProdEnv((k) => env[k]).sort()).toEqual(['AUTH_SECRET', 'MONGODB_URI'].sort())
  })
})

describe('requireInProd', () => {
  it('returns the value whether or not in prod', () => {
    expect(requireInProd('X', 'v', true)).toBe('v')
    expect(requireInProd('X', 'v', false)).toBe('v')
  })
  it('allows missing/blank outside production (dev fallback)', () => {
    expect(requireInProd('X', undefined, false)).toBeUndefined()
    expect(requireInProd('X', '   ', false)).toBe('   ')
  })
  it('throws in production when missing or blank', () => {
    expect(() => requireInProd('X', undefined, true)).toThrow('X is required in production')
    expect(() => requireInProd('X', '   ', true)).toThrow()
  })
})
