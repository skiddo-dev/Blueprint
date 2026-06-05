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
  // Bare 3-digit numbers not part of a money figure or a longer number.
  for (const m of text.matchAll(/(?<![,$\d])(\d{3})(?![,\d])/g)) found.add(m[1])
  return [...found].sort()
}

/** Normalize an arbitrary list (e.g. LLM output) down to clean 3-digit store
 *  strings, de-duplicated and sorted. */
export function normalizeStoreNumbers(values: readonly unknown[]): string[] {
  const found = new Set<string>()
  for (const v of values) {
    const m = String(v).match(/\d{3}/)
    if (m) found.add(m[0])
  }
  return [...found].sort()
}
