import { describe, it, expect } from 'vitest'
import { missingProdEnv, REQUIRED_PROD_ENV } from './config'

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
