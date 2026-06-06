import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleError } from './hooks.server'

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
