import { describe, it, expect } from 'vitest'
import { createSort } from './tableSort.svelte'

type Row = { name: string; total: number; due: string }
const rows: Row[] = [
  { name: 'Mango', total: 300, due: '2026-02-01' },
  { name: 'apple', total: 100, due: '2026-03-15' },
  { name: 'Banana', total: 200, due: '2026-01-20' },
]
const accessors = {
  name: (r: Row) => r.name,
  total: (r: Row) => r.total,
  due: (r: Row) => r.due,
}

describe('createSort', () => {
  it('returns rows untouched (same reference) before any column is chosen', () => {
    const sort = createSort<Row>(accessors)
    expect(sort.apply(rows)).toBe(rows)
    expect(sort.key).toBeNull()
  })

  it('sorts numbers ascending, then flips to descending on re-toggle', () => {
    const sort = createSort<Row>(accessors)
    sort.toggle('total')
    expect(sort.apply(rows).map((r) => r.total)).toEqual([100, 200, 300])
    sort.toggle('total')
    expect(sort.dir).toBe('desc')
    expect(sort.apply(rows).map((r) => r.total)).toEqual([300, 200, 100])
  })

  it('sorts strings case-insensitively (locale compare)', () => {
    const sort = createSort<Row>(accessors)
    sort.toggle('name')
    expect(sort.apply(rows).map((r) => r.name)).toEqual(['apple', 'Banana', 'Mango'])
  })

  it('switching to another column resets the direction to ascending', () => {
    const sort = createSort<Row>(accessors)
    sort.toggle('total')
    sort.toggle('total') // now desc
    sort.toggle('due')
    expect(sort.dir).toBe('asc')
    expect(sort.apply(rows).map((r) => r.due)).toEqual(['2026-01-20', '2026-02-01', '2026-03-15'])
  })

  it('never mutates the source array', () => {
    const sort = createSort<Row>(accessors)
    const before = [...rows]
    sort.toggle('total')
    sort.apply(rows)
    expect(rows).toEqual(before)
  })

  it('reports aria-sort only for the active column', () => {
    const sort = createSort<Row>(accessors)
    expect(sort.ariaSort('name')).toBeUndefined()
    sort.toggle('name')
    expect(sort.ariaSort('name')).toBe('ascending')
    expect(sort.ariaSort('total')).toBeUndefined()
    sort.toggle('name')
    expect(sort.ariaSort('name')).toBe('descending')
  })

  it('ignores an unknown column key', () => {
    const sort = createSort<Row>(accessors)
    sort.toggle('nope')
    expect(sort.apply(rows)).toBe(rows)
  })
})
