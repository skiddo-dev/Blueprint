// Minimal, dependency-free CSV reader. Enough to round-trip our own task export
// and typical Excel / Google Sheets CSV: quoted fields, "" escapes, embedded
// commas/newlines, CR/LF line endings, and a leading UTF-8 BOM. Not a full
// RFC-4180 validator — it's lenient on purpose so a hand-edited file still imports.

/** Parse CSV text into rows of string cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  if (text.charCodeAt(0) === 0xfeff) i = 1 // strip BOM

  for (; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } // "" → escaped quote
        else inQuotes = false
      } else if (c !== '\r') {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  // Flush the final field/row (the file may not end in a newline).
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  // Drop fully-empty rows (e.g. a trailing newline yields ['']).
  return rows.filter(r => !(r.length === 1 && r[0] === ''))
}

/** Parse CSV with a header row into records keyed by trimmed, lowercased header.
 *  Rows shorter or longer than the header are tolerated. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim().toLowerCase())
  return rows.slice(1).map(r => {
    const rec: Record<string, string> = {}
    headers.forEach((h, idx) => { rec[h] = (r[idx] ?? '').trim() })
    return rec
  })
}
