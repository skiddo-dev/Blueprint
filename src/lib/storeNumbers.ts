// Store / site number extraction (e.g. "D-412", "D412", or a bare "412").
// Shared by the server (email sync + manual task create) and the card UI so the
// pattern lives in exactly one place.
//
// Note: the bare-3-digit pattern is reliable on short, store-focused TITLES but
// noisy on full email bodies (phone numbers, zip codes, suite numbers). For
// bodies we rely on the LLM (context-aware) instead — see src/lib/server/llm.ts.
export function extractStoreNumbers(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  // Explicit store references: "D-412", "D 412", "D412".
  for (const m of text.matchAll(/\bD[-\s]?(\d{3})\b/gi)) found.add(m[1])
  // Explicit "#455" references (trusted even mid-compound: "#455-Roseville").
  for (const m of text.matchAll(/#\s?(\d{3})\b/g)) found.add(m[1])
  // Bare 3-digit numbers not part of a money figure, a longer number, or a
  // hyphenated code: "Kroger #455 (RMI 026-150)" carries a job number whose
  // halves both look like stores — digits touching a hyphen don't count
  // ("D-412" and "#455-…" are caught by the explicit patterns above).
  for (const m of text.matchAll(/(?<![,$\d-])(\d{3})(?![,\d-])/g)) found.add(m[1])
  return [...found].sort()
}

/** Normalize an arbitrary list (e.g. LLM output) down to clean 3-digit store
 *  strings, de-duplicated and sorted. Hyphenated number compounds ("026-150" —
 *  RMI/permit-style job codes) are dropped whole: their halves are not stores. */
export function normalizeStoreNumbers(values: readonly unknown[]): string[] {
  const found = new Set<string>()
  for (const v of values) {
    const s = String(v)
    if (/\d-\d/.test(s)) continue // digit-hyphen-digit = a code, not a store ("D-412" still passes)
    const m = s.match(/\d{3}/)
    if (m) found.add(m[0])
  }
  return [...found].sort()
}
