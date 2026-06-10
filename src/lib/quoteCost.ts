// What the proposal's cost box displays, shared by the Quote Generator's live
// preview (client) and the PDF renderer (server) so the two can never drift.
//
// Quote pricing is legacy float dollars, not the books' integer cents — quotes
// never enter the ledger (see src/lib/money.ts for the boundary).

export interface QuoteCostInput {
  labor: number
  materials: number
  total: number
  /** Print the labor (and materials, when non-zero) lines. Defaults to whether a breakdown was provided. */
  show_labor?: boolean
  /** Print the total line. Defaults to true. */
  show_total?: boolean
}

export type QuoteCostRow = [label: string, amount: number]

export function quoteCostRows(d: QuoteCostInput): QuoteCostRow[] {
  const showLabor = d.show_labor ?? (d.labor > 0 || d.materials > 0)
  const showTotal = d.show_total ?? true
  const rows: QuoteCostRow[] = []
  if (showLabor) {
    rows.push(['Labor:', d.labor])
    if (d.materials > 0) rows.push(['Materials:', d.materials])
  }
  // A lone figure reads as "Amount"; alongside a breakdown it's the "Total".
  if (showTotal) rows.push([showLabor ? 'Total:' : 'Amount:', d.total])
  return rows
}
