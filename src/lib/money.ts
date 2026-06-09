// Money in Blueprint's books is an integer count of cents (USD minor units),
// never a float — floating point can't represent 0.10 + 0.20 exactly, and a
// double-entry ledger's one job is to balance to the penny. `Cents` is a branded
// number so a raw dollar float can't be passed where cents are expected; at
// runtime it's just an integer. Every ledger amount flows through these helpers.
//
// The legacy float `amount` on Quote (src/lib/types.ts) is for quoting only and
// never enters the books — see the accounting module for the boundary.

export type Cents = number & { readonly __brand: 'Cents' }

/** Brand a raw integer as Cents. Throws unless it's a safe integer. */
export function cents(n: number): Cents {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`cents() expects a safe integer, got ${n}`)
  }
  return n as Cents
}

/** Dollars (a decimal number) → Cents, rounded half-away-from-zero to the penny.
 *  Use when converting numeric input; never store the float itself. */
export function fromDollars(dollars: number): Cents {
  if (!Number.isFinite(dollars)) {
    throw new RangeError(`fromDollars() expects a finite number, got ${dollars}`)
  }
  // Round the magnitude so +0.005 and -0.005 round symmetrically away from zero.
  const sign = dollars < 0 ? -1 : 1
  return cents(sign * Math.round(Math.abs(dollars) * 100))
}

/** Parse a user-entered money string → Cents. Accepts "$", thousands separators,
 *  and the accounting convention of parentheses for negatives, e.g. "$12,300.50",
 *  "(45.00)", "-5". Throws on anything that isn't a number. */
export function parseMoney(input: string | number): Cents {
  if (typeof input === 'number') return fromDollars(input)
  const raw = input.trim()
  if (!raw) throw new SyntaxError('parseMoney() got an empty string')
  const negative = /^\(.*\)$/.test(raw)
  const cleaned = raw.replace(/[(),$\s]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new SyntaxError(`parseMoney() could not parse "${input}"`)
  return fromDollars(negative ? -Math.abs(n) : n)
}

/** Sum any number of Cents. */
export function sum(values: Cents[]): Cents {
  return cents(values.reduce((a, c) => a + c, 0))
}

export function add(a: Cents, b: Cents): Cents { return cents(a + b) }
export function sub(a: Cents, b: Cents): Cents { return cents(a - b) }
export function negate(a: Cents): Cents { return cents(-a) }

/** Multiply cents by a (possibly fractional) factor, rounding to the penny —
 *  e.g. applying a 6% tax rate, or unit-price × quantity. */
export function mul(amount: Cents, factor: number): Cents {
  if (!Number.isFinite(factor)) throw new RangeError(`mul() factor must be finite, got ${factor}`)
  const product = amount * factor
  const sign = product < 0 ? -1 : 1
  return cents(sign * Math.round(Math.abs(product)))
}

/** Split `total` into parts proportional to `weights`, with NO lost or invented
 *  pennies: the parts always sum back to `total`. Uses largest-remainder
 *  apportionment — leftover cents go to the largest fractional remainders (ties
 *  break to the earlier index, so the result is deterministic). `total` and all
 *  weights must be non-negative. */
export function allocate(total: Cents, weights: number[]): Cents[] {
  if (total < 0) throw new RangeError('allocate() total must be non-negative')
  if (!weights.length) throw new RangeError('allocate() needs at least one weight')
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new RangeError('allocate() weights must be finite and non-negative')
  }
  const totalWeight = weights.reduce((a, w) => a + w, 0)
  if (totalWeight === 0) throw new RangeError('allocate() weights sum to zero')

  const exact = weights.map((w) => (total * w) / totalWeight)
  const floored = exact.map(Math.floor)
  let remaining = total - floored.reduce((a, n) => a + n, 0)
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const result = floored.slice()
  for (let k = 0; remaining > 0; k++, remaining--) result[order[k].i] += 1
  return result.map((n) => cents(n))
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Format Cents as a USD string, e.g. cents(1230) → "$12.30". */
export function format(amount: Cents): string {
  return USD.format(amount / 100)
}

/** Cents → a plain decimal number of dollars (for charts/exports only — lossy;
 *  never round-trip money back through fromDollars after this). */
export function toDollars(amount: Cents): number {
  return amount / 100
}
