import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleError, fakeAuthInProd } from './hooks.server'

afterEach(() => vi.restoreAllMocks())

describe('handleError', () => {
  it('logs the error with context + a correlation id and returns a sanitized shape', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const event = { request: { method: 'POST' }, url: new URL('https://x.test/api/tasks') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = handleError({ error: new Error('kaboom'), event, status: 500, message: 'Internal Error' } as any)

    // Client-facing shape: generic message + an id, never the real message/stack.
    expect(result).toMatchObject({ message: 'Internal error' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (result as any).id).toBe('string')
    expect(JSON.stringify(result)).not.toContain('kaboom')

    // Server log: full detail, with the same correlation id.
    const logged = JSON.parse(spy.mock.calls[0][0] as string)
    expect(logged).toMatchObject({ msg: 'unhandled server error', path: '/api/tasks', method: 'POST', error: 'kaboom' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(logged.id).toBe((result as any).id)
  })
})

describe('fakeAuthInProd (DEV_FAKE_AUTH production guard)', () => {
  it('flags only NODE_ENV=production WITH the bypass set', () => {
    expect(fakeAuthInProd('production', '1')).toBe(true)
    expect(fakeAuthInProd('production', 'true')).toBe(true)
  })
  it('is safe in dev/preview, or when the flag is unset', () => {
    expect(fakeAuthInProd('production', undefined)).toBe(false)
    expect(fakeAuthInProd('production', '')).toBe(false)
    expect(fakeAuthInProd('development', '1')).toBe(false) // dev/preview bypass is fine
    expect(fakeAuthInProd(undefined, '1')).toBe(false)
  })
})
