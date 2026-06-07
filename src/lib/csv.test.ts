import { describe, it, expect } from 'vitest'
import { parseCsv, parseCsvRecords } from './csv'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('handles quoted fields with commas, escaped quotes, and embedded newlines', () => {
    const csv = 'name,note\n"Smith, John","He said ""hi""\nsecond line"'
    expect(parseCsv(csv)).toEqual([
      ['name', 'note'],
      ['Smith, John', 'He said "hi"\nsecond line'],
    ])
  })

  it('tolerates a BOM, CRLF endings, and a trailing newline', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('drops blank lines', () => {
    expect(parseCsv('a\n\nb')).toEqual([['a'], ['b']])
  })
})

describe('parseCsvRecords', () => {
  it('keys cells by trimmed, lowercased header', () => {
    expect(parseCsvRecords('Title, Status \nRoof, To Do ')).toEqual([{ title: 'Roof', status: 'To Do' }])
  })

  it('returns [] when there is no data row', () => {
    expect(parseCsvRecords('')).toEqual([])
    expect(parseCsvRecords('title,status')).toEqual([])
  })
})
