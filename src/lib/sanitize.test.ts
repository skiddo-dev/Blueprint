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
})
