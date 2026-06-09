import { describe, it, expect } from 'vitest'
import { parseChallenge, buildDigestHeader } from './digest'

describe('parseChallenge', () => {
  it('parses quoted and unquoted Digest params', () => {
    const c = parseChallenge(
      'Digest realm="testrealm@host.com", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c", algorithm=MD5',
    )
    expect(c.realm).toBe('testrealm@host.com')
    expect(c.qop).toBe('auth')
    expect(c.nonce).toBe('dcd98b7102dd2f0e8b11d0f600bfb0c093')
    expect(c.opaque).toBe('5ccc069c')
    expect(c.algorithm).toBe('MD5')
  })
})

describe('buildDigestHeader', () => {
  // The canonical RFC 2617 §3.5 worked example — pins the response hash so a
  // regression in the HA1/HA2/response chain is caught.
  it('matches the RFC 2617 example response', () => {
    const header = buildDigestHeader({
      method: 'GET',
      uri: '/dir/index.html',
      username: 'Mufasa',
      password: 'Circle Of Life',
      challenge: { realm: 'testrealm@host.com', nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093', qop: 'auth' },
      cnonce: '0a4f113b',
      nc: '00000001',
    })
    expect(header).toContain('response="6629fae49393a05397450978507c4ef1"')
    expect(header).toContain('username="Mufasa"')
    expect(header).toContain('uri="/dir/index.html"')
    expect(header).toContain('qop=auth')
    expect(header).toContain('nc=00000001')
  })

  it('omits qop fields when the challenge has no qop', () => {
    const header = buildDigestHeader({
      method: 'GET',
      uri: '/x',
      username: 'u',
      password: 'p',
      challenge: { realm: 'r', nonce: 'n' },
    })
    expect(header).not.toContain('qop=')
    expect(header).not.toContain('nc=')
    expect(header).toMatch(/response="[0-9a-f]{32}"/)
  })
})
