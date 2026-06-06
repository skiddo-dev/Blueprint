// Merge spelling variants from the RAVES Quote Log so analytics consolidate
// (e.g. "Malachi Mosely" and "Malachi Mosley" are one person). Used on read in
// the dashboard, on insert in the generate endpoint, and by the one-off
// back-fill migration — single source of truth for the alias maps.

// Keyed by lower-cased, trimmed value → canonical display value.
const CONTACT_ALIASES: Record<string, string> = {
  'malachi mosely': 'Malachi Mosley',
  'kyle simak': 'Kyle Semak',
  'jack torrence': 'Jack Torrance',
  'jack k': 'Jack Kristensen',
  'jack kristenson': 'Jack Kristensen',
  'tyler w': 'Tyler Washington',
}

const WORK_TYPE_ALIASES: Record<string, string> = {
  'extra': 'Extras',
  'credit': 'Credits',
  'front end': 'Front End Work',
  'natural food int': 'Nat Food Int',
  'rx counsel rm': 'RX Counsel Room',
}

export function canonicalizeContact(name: string | undefined | null): string {
  const v = (name ?? '').trim()
  return CONTACT_ALIASES[v.toLowerCase()] ?? v
}

export function canonicalizeWorkType(desc: string | undefined | null): string {
  const v = (desc ?? '').trim()
  return WORK_TYPE_ALIASES[v.toLowerCase()] ?? v
}
