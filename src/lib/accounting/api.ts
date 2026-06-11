// Turn a failed fetch Response into a sentence a person can read. Accounting
// endpoints answer errors as JSON `{ message }` — before this, several forms
// rendered that raw JSON verbatim in their error line.
export async function apiError(r: Response): Promise<string> {
  const text = await r.text().catch(() => '')
  try {
    const j: unknown = JSON.parse(text)
    if (j && typeof j === 'object' && 'message' in j && typeof j.message === 'string' && j.message) {
      return j.message
    }
  } catch {
    // not JSON — fall through to the raw body
  }
  return text || `Request failed (HTTP ${r.status})`
}
