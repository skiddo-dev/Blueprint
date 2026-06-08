import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleError, fakeAuthInProd, buildSecurityHeaders, CSP, applySecurityHeaders } from './hooks.server'

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

describe('buildSecurityHeaders', () => {
  it('always sets the zero-risk hardening headers', () => {
    const h = buildSecurityHeaders({ dev: false, https: true })
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Permissions-Policy']).toContain('camera=()')
  })

  it('enforces CSP in built runs but not in dev (Vite HMR needs inline/eval)', () => {
    expect(buildSecurityHeaders({ dev: false, https: true })['Content-Security-Policy']).toBe(CSP)
    expect(buildSecurityHeaders({ dev: true, https: true })['Content-Security-Policy']).toBeUndefined()
  })

  it('sends HSTS only over real HTTPS in a built run', () => {
    expect(buildSecurityHeaders({ dev: false, https: true })['Strict-Transport-Security']).toContain('max-age=')
    expect(buildSecurityHeaders({ dev: false, https: false })['Strict-Transport-Security']).toBeUndefined()
    expect(buildSecurityHeaders({ dev: true, https: true })['Strict-Transport-Security']).toBeUndefined()
  })

  it('CSP locks down framing/base/object and still allows the report iframe fonts', () => {
    expect(CSP).toContain("frame-ancestors 'none'")
    expect(CSP).toContain("base-uri 'self'")
    expect(CSP).toContain("object-src 'none'")
    expect(CSP).toContain('https://fonts.gstatic.com') // Competitive Landscape sheet
  })

  it('form-action allows the Microsoft Entra OAuth redirect chain', () => {
    expect(CSP).toContain("form-action 'self' https://login.microsoftonline.com")
  })
})

describe('applySecurityHeaders', () => {
  const extra = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' }

  it('sets headers in place on a normal (mutable) response', () => {
    const res = applySecurityHeaders(new Response('ok', { status: 200 }), extra)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('does NOT throw on an immutable-headers response and still applies headers (Auth.js OAuth redirect regression)', () => {
    // Response.redirect() returns immutable headers — the exact shape Auth.js
    // returns for the Microsoft sign-in redirect that 500'd in prod.
    const redirect = Response.redirect('https://login.example/authorize', 302)
    expect(() => redirect.headers.set('x', 'y')).toThrow() // precondition: immutable
    const res = applySecurityHeaders(redirect, extra)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://login.example/authorize')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })
})
