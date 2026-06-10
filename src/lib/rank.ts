// Fractional ranking for board cards. A task's `rank` is a base-36 string; a
// column sorts by plain lexicographic order (Mongo's default string sort), and
// dropping a card between two neighbours assigns it a key strictly between
// theirs — one document write per drag, no renumbering of siblings.
//
// Invariant: no generated key ever ends in '0' (the smallest digit). A key like
// "a0" has nothing between it and "a" ("a" < x < "a0" is unsatisfiable), so
// keeping trailing-'0' keys out of the system guarantees rankBetween always has
// room. Both generators below uphold this; nothing else writes ranks.

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

/** A key strictly between `a` and `b` (lexicographic). `null` bounds mean
 *  -infinity / +infinity: rankBetween(null, first) prepends, rankBetween(last,
 *  null) appends, rankBetween(null, null) seeds an empty column. */
export function rankBetween(a: string | null, b: string | null): string {
  const lo = a ?? ''
  const hi = b ?? ''
  if (a !== null && b !== null && lo >= hi) {
    throw new Error(`rankBetween: "${lo}" must sort before "${hi}"`)
  }
  let out = ''
  // Whether the upper bound still constrains: the moment the result commits to
  // a digit strictly below hi's digit at the same position, every extension is
  // already < hi, and hi's remaining digits must be ignored (treating them as a
  // bound here is the classic midpoint bug — it can produce a key below `a`).
  let hiActive = true
  for (let i = 0; ; i++) {
    // Past its end, the lower bound pads with 0 and the upper with BASE (one
    // past the max digit), i.e. "" behaves as -inf and a missing upper as +inf.
    const ca = i < lo.length ? DIGITS.indexOf(lo[i]) : 0
    const cb = hiActive && i < hi.length ? DIGITS.indexOf(hi[i]) : BASE
    if (ca === cb) {
      out += DIGITS[ca]
      continue
    }
    const mid = Math.floor((ca + cb) / 2)
    if (mid === ca) {
      // No digit fits strictly between ca and cb — keep the low digit (the
      // result stays a prefix-extension of `a`, so `a` keeps constraining) and
      // find room deeper. ca < cb, so the bound is now strictly below hi.
      out += DIGITS[ca]
      hiActive = false
      continue
    }
    // mid > ca >= 0, so the final digit is never '0'.
    return out + DIGITS[mid]
  }
}

/** `n` evenly spaced keys in ascending order — used to seed ranks for a column
 *  of existing cards. Even spacing (rather than chained rankBetween calls, which
 *  cluster toward one end) leaves uniform room for future drags. */
export function spreadRanks(n: number): string[] {
  if (n <= 0) return []
  // Fixed width sized so consecutive keys are ≥ BASE apart — room for plenty of
  // midpoint insertions before keys grow a digit, and enough that nudging a
  // trailing '0' up to '1' can never collide with a neighbour.
  let width = 2
  while (BASE ** width < (n + 2) * BASE) width++
  const span = BASE ** width
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    let v = Math.floor((span * i) / (n + 1))
    let key = ''
    for (let w = 0, rem = v; w < width; w++) {
      key = DIGITS[rem % BASE] + key
      rem = Math.floor(rem / BASE)
    }
    if (key.endsWith('0')) key = key.slice(0, -1) + '1'
    out.push(key)
  }
  return out
}
