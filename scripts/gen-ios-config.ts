/**
 * Generates `ios/Blueprint/Models/BlueprintConfig.generated.swift` from the
 * app's single source of truth for UI constants, `src/lib/constants.ts` — the
 * same values served at `GET /api/config`.
 *
 * Run from the repo root:
 *
 *     npm run gen:ios
 *
 * Why read the module instead of the endpoint: codegen then needs no running
 * server and no auth, and works offline / in CI. The `/api/config` endpoint
 * test (`src/routes/api/config/config.test.ts`) asserts the endpoint matches
 * this module verbatim, so generating from the module ≡ generating from the
 * endpoint. The Swift side reads these values instead of hand-copying them
 * (the colours/icons in `TaskStatus.swift` used to drift silently from the web).
 *
 * Node ≥23 runs this `.ts` directly (native type stripping); `constants.ts` has
 * only type-only imports, so no transpiler/loader is required.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'
import {
  KANBAN_STATUSES,
  STATUS_META,
  QUOTE_TYPES,
  QUOTE_PEOPLE,
  QUOTE_CONTACTS,
  QUOTE_WORK_TYPES,
  SUPERVISORS,
  QUOTE_STATUSES,
  QUOTE_STATUS_META,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_META,
} from '../src/lib/constants.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const OUT = resolve(repoRoot, 'ios/Blueprint/Models/BlueprintConfig.generated.swift')

// '#6366f1' / '6366f1' → '0x6366F1' (the literal `Color(hex:)` expects).
function hex(css: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(css.trim())
  if (!m) throw new Error(`Expected a 6-digit hex colour, got: ${JSON.stringify(css)}`)
  return '0x' + m[1].toUpperCase()
}

const str = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
const arr = (xs: readonly string[]) => `[${xs.map(str).join(', ')}]`

const lines: string[] = []
const p = (s = '') => lines.push(s)

p('// GENERATED — DO NOT EDIT BY HAND.')
p('//')
p('// Swift mirror of the shared UI constants in `src/lib/constants.ts` (the flat')
p('// constant tables of `GET /api/config`). Regenerate from the repo root with:')
p('//')
p('//     npm run gen:ios')
p('//')
p('// Hand edits will be overwritten on the next generate.')
p('')
p('enum BlueprintConfig {')
p('    struct StatusMeta { let color: UInt32; let bg: UInt32; let text: UInt32; let icon: String }')
p('    struct QuoteStatusMeta { let color: UInt32; let bg: UInt32; let text: UInt32 }')
p('    struct ProspectStatusMeta { let label: String; let color: UInt32; let bg: UInt32; let text: UInt32 }')
p('')
p('    /// Kanban statuses in board order.')
p(`    static let taskStatuses: [String] = ${arr(KANBAN_STATUSES)}`)
p('')
p('    /// Per-status colours + glyph, keyed by the backend status string.')
p('    static let statusMeta: [String: StatusMeta] = [')
for (const s of KANBAN_STATUSES) {
  const m = STATUS_META[s]
  p(`        ${str(s)}: StatusMeta(color: ${hex(m.color)}, bg: ${hex(m.bg)}, text: ${hex(m.text)}, icon: ${str(m.icon)}),`)
}
p('    ]')
p('')
p(`    static let quoteTypes: [String] = ${arr(QUOTE_TYPES)}`)
p(`    static let quotePeople: [String] = ${arr(QUOTE_PEOPLE)}`)
p(`    static let quoteContacts: [String] = ${arr(QUOTE_CONTACTS)}`)
p(`    static let quoteWorkTypes: [String] = ${arr(QUOTE_WORK_TYPES)}`)
p(`    static let supervisors: [String] = ${arr(SUPERVISORS)}`)
p(`    static let quoteStatuses: [String] = ${arr(QUOTE_STATUSES)}`)
p('')
p('    static let quoteStatusMeta: [String: QuoteStatusMeta] = [')
for (const s of QUOTE_STATUSES) {
  const m = QUOTE_STATUS_META[s]
  p(`        ${str(s)}: QuoteStatusMeta(color: ${hex(m.color)}, bg: ${hex(m.bg)}, text: ${hex(m.text)}),`)
}
p('    ]')
p('')
p(`    static let prospectStatuses: [String] = ${arr(PROSPECT_STATUSES)}`)
p('')
p('    static let prospectStatusMeta: [String: ProspectStatusMeta] = [')
for (const s of PROSPECT_STATUSES) {
  const m = PROSPECT_STATUS_META[s]
  p(`        ${str(s)}: ProspectStatusMeta(label: ${str(m.label)}, color: ${hex(m.color)}, bg: ${hex(m.bg)}, text: ${hex(m.text)}),`)
}
p('    ]')
p('}')
p('')

writeFileSync(OUT, lines.join('\n'))
console.log(`Generated ${relative(repoRoot, OUT)} from src/lib/constants.ts`)
