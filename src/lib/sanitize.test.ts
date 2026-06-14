import { describe, it, expect } from 'vitest'
import { escapeHtml, csvCell, contentDisposition } from './sanitize'

describe('escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(escapeHtml(`a&b"c'd`)).toBe('a&amp;b&quot;c&#39;d')
  })
  it('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('csvCell', () => {
  it('defuses formula-injection leads with an apostrophe', () => {
    expect(csvCell('=1+1')).toBe(`'=1+1`)
    expect(csvCell('+cmd')).toBe(`'+cmd`)
    expect(csvCell('-2')).toBe(`'-2`)
    expect(csvCell('@SUM(A1)')).toBe(`'@SUM(A1)`)
  })
  it('quotes per RFC-4180 and combines with the formula guard', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('=a,b')).toBe(`"'=a,b"`)
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(null)).toBe('')
  })
})

describe('contentDisposition', () => {
  it('sanitizes the ASCII filename and adds filename*', () => {
    const h = contentDisposition('réport "v2"/\r\n.pdf')
    expect(h.startsWith('attachment; filename="')).toBe(true)
    expect(h).not.toMatch(/[\r\n]/) // no header injection
    expect(h).toContain("filename*=UTF-8''")
  })
  it('falls back when empty', () => {
    expect(contentDisposition('')).toContain('filename="download"')
  })

  // Regression for the 2026-06-08 prod 500: a synced attachment named with a
  // U+202F (narrow no-break space, code 8239) reached the ByteString header and
  // threw "character ... value of 8239 which is greater than 255". Every code unit
  // in the header value MUST be <= 255, or Headers.set throws.
  const nonAscii: [string, string][] = [
    ['U+202F narrow no-break space', 'memo final.pdf'],
    ['CJK', '正常な領収書.pdf'],
    ['emoji', 'invoice \u{1F4C4} final.pdf'],
    ['accented (Latin-1, still > ASCII)', 'résumé.pdf'],
    ['RTL mark + non-breaking space', 'a‏ b.pdf'],
    ['CR + LF control chars', 'a b\r\nc.pdf'],
    ['path traversal + quote', '../../etc/"passwd".pdf'],
  ]

  it.each(nonAscii)('produces a ByteString-safe header for %s', (_label, name) => {
    const h = contentDisposition(name)
    // The actual failure mode: setting a >255 code unit on a real Headers throws.
    expect(() => new Headers({ 'Content-Disposition': h })).not.toThrow()
    // Belt-and-suspenders: no code unit exceeds Latin-1, and no control chars / CRLF.
    for (const ch of h) expect(ch.charCodeAt(0)).toBeLessThanOrEqual(255)
    expect(h).not.toMatch(/[\x00-\x1f\x7f]/)
    // Both the legacy ASCII filename and the RFC 5987 filename* must be present.
    expect(h).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''/)
  })

  it('percent-encodes the unicode name in filename* (incl. apostrophe/parens)', () => {
    const h = contentDisposition("O'Brien (final) résumé.pdf")
    const ext = h.split("filename*=UTF-8''")[1]
    // RFC 5987 ext-value must be pure ASCII and must not contain a raw apostrophe
    // (it would collide with the charset'lang'value delimiters) or parens.
    expect(ext).not.toMatch(/['()]/)
    expect(ext).toBe('O%27Brien%20%28final%29%20r%C3%A9sum%C3%A9.pdf')
    // Round-trips back to the original Unicode name.
    expect(decodeURIComponent(ext)).toBe("O'Brien (final) résumé.pdf")
  })

  it('honors the inline disposition type', () => {
    expect(contentDisposition('statement.pdf', 'inline')).toMatch(/^inline; filename="statement.pdf"/)
  })
})
