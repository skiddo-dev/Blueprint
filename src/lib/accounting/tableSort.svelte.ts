// Client-side column sort for the accounting entity lists (invoices, bills,
// customers…). The lists are already fully loaded, so sorting is a re-order,
// not a re-fetch. Pair with SortTh.svelte for the clickable headers.
//
// Registers deliberately do NOT sort: their running-balance column only means
// anything in date order.
//
//   const sort = createSort<Row>({ date: (r) => r.date, total: (r) => r.total })
//   const sorted = $derived(sort.apply(visible))

export type SortDir = 'asc' | 'desc'

export interface TableSort<T> {
  readonly key: string | null
  readonly dir: SortDir
  toggle(key: string): void
  ariaSort(key: string): 'ascending' | 'descending' | undefined
  apply(rows: T[]): T[]
}

export function createSort<T>(accessors: Record<string, (row: T) => string | number>): TableSort<T> {
  let key = $state<string | null>(null)
  let dir = $state<SortDir>('asc')

  return {
    get key() {
      return key
    },
    get dir() {
      return dir
    },
    toggle(k: string) {
      if (key === k) {
        dir = dir === 'asc' ? 'desc' : 'asc'
      } else {
        key = k
        dir = 'asc'
      }
    },
    ariaSort(k: string) {
      return key === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined
    },
    apply(rows: T[]) {
      if (!key) return rows
      const acc = accessors[key]
      if (!acc) return rows
      const sign = dir === 'asc' ? 1 : -1
      return [...rows].sort((a, b) => {
        const va = acc(a)
        const vb = acc(b)
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
        return String(va).localeCompare(String(vb)) * sign
      })
    },
  }
}
