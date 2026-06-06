// Parsing for `@name` mentions in card comments. Isomorphic + pure so the client
// can highlight/autocomplete while the server computes the authoritative list
// (never trust a client-supplied mentions array).

// A mention token: an `@` at a word boundary (start or after whitespace, so an
// email address like foo@bar.com is NOT treated as a mention) followed by a
// name-ish run. Capturing only the token after the `@`.
const MENTION_RE = /(?:^|\s)@([A-Za-z][A-Za-z0-9._-]*)/g

// First word of a name, lowercased — the unit we match a token against, so
// `@Frank` resolves to "Frank Crew" and `@Bob` to "Bob".
function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

/**
 * Find the `@name` mentions in `text` that resolve to a known candidate, and
 * return the candidates' canonical names (de-duped, in first-appearance order).
 * Matching is case-insensitive and on the candidate's first word, so multi-word
 * names ("Frank Crew") are reachable as `@Frank`. Unknown `@names` are ignored.
 */
export function parseMentions(text: string, candidates: string[]): string[] {
  if (!text || !candidates.length) return []
  const byFirstWord = new Map<string, string[]>()
  for (const c of candidates) {
    const key = firstWord(c)
    if (!key) continue
    const list = byFirstWord.get(key) ?? []
    list.push(c)
    byFirstWord.set(key, list)
  }

  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) {
    const token = m[1].toLowerCase()
    for (const canonical of byFirstWord.get(token) ?? []) {
      if (!seen.has(canonical)) {
        seen.add(canonical)
        out.push(canonical)
      }
    }
  }
  return out
}
