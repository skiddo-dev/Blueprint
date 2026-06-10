#!/usr/bin/env node
// Builds docs/blueprint-iconography-before-after.pdf — the client-facing
// before/after sheet for the custom icon redesign (feat/custom-icons).
//
// The "after" glyphs are parsed out of src/lib/icons.ts at build time so the
// sheet always matches what ships; the "before" column is the emoji each
// surface used previously (frozen here — the emoji are gone from the code).
//
// Pipeline (same as build-guides.mjs): HTML --Chrome --print-to-pdf--> PDF.
// Requires Google Chrome. Usage: node scripts/build-icon-redesign-pdf.mjs

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_PDF = join(ROOT, 'docs', 'blueprint-iconography-before-after.pdf')

// ── Pull the live glyphs out of icons.ts ─────────────────────────────────
const src = readFileSync(join(ROOT, 'src', 'lib', 'icons.ts'), 'utf8')
const ICONS = {}
for (const m of src.matchAll(/^\s{2}(?:'([\w-]+)'|([\w-]+)):\s+'(.*)',$/gm)) {
  ICONS[m[1] ?? m[2]] = m[3]
}
if (Object.keys(ICONS).length < 40) {
  throw new Error(`icons.ts parse looks wrong — only ${Object.keys(ICONS).length} glyphs found`)
}

const svg = (name, size = 18) => {
  if (!ICONS[name]) throw new Error(`unknown icon: ${name}`)
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
}

// ── Before → after, by surface ───────────────────────────────────────────
const SECTIONS = [
  ['Main navigation (drawer)', 'NavDrawer.svelte — the route list every admin page shares, plus the drawer controls.', [
    ['Brand row', null, 'logo', 'New — drafting set-square logomark on a brand chip'],
    ['Kanban Board', '🏗️', 'board'],
    ['Dashboard', '📊', 'dashboard'],
    ['Quote Generator', '💰', 'quote'],
    ['Accounting', '📒', 'ledger'],
    ['Infra Spend', '💸', 'spend'],
    ['Prospects', '🏭', 'prospects'],
    ['Competitive Landscape', '🗺️', 'map'],
    ['Search', '🔎', 'search'],
    ['Help & Guide', '📖', 'guide'],
    ['Open menu (mobile)', '☰', 'menu'],
    ['Close drawer (mobile)', '✕', 'x'],
  ]],
  ['Board toolbar & theme', 'KanbanBoard.svelte toolbar, view pills and empty state; ThemeToggle.svelte.', [
    ['Blueprint title', '🏗️', 'logo'],
    ['Refresh now', '🔄', 'refresh'],
    ['New Task', '✏️', 'pencil'],
    ['My Work', '🙋', 'person'],
    ['All Tasks', '📋', 'list'],
    ['View (mobile fold)', '⚙️', 'sliders'],
    ['Empty-board state', '🗂️', 'board'],
    ['Theme: Light', '☀️', 'sun'],
    ['Theme: Dark', '🌙', 'moon'],
    ['Theme: System', '🖥️', 'monitor'],
  ]],
  ['Accounting section nav', 'AccountingShell.svelte — the 16 pills shown on every Blueprint Books page.', [
    ['Overview', '📒', 'ledger'],
    ['Invoices', '📄', 'invoice'],
    ['Customers', '🤝', 'users'],
    ['A/R Aging', '📈', 'trend-up'],
    ['Bills', '🧾', 'bill'],
    ['POs', '📑', 'po'],
    ['Vendors', '🏗️', 'vendors'],
    ['A/P Aging', '📉', 'trend-down'],
    ['Reports', '📊', 'reports'],
    ['Budgets', '🎯', 'budget'],
    ['Sales tax', '🏛️', 'tax'],
    ['Audit log', '🛡️', 'audit'],
    ['Deposits', '🏦', 'deposit'],
    ['Reconcile', '✅', 'reconcile'],
    ['Recurring', '🔁', 'recurring'],
    ['Assets', '🚚', 'asset'],
  ]],
  ['Board sidebar — admin controls', 'Sidebar.svelte — expander headings and action buttons in the board drawer.', [
    ['Access Requests', '🔔', 'bell'],
    ['Approve request', '✓', 'check'],
    ['Dismiss / remove', '✕', 'x'],
    ['View User Activity', '👁️', 'eye'],
    ['User Access', '👥', 'users'],
    ['Add / Update user', '➕', 'plus'],
    ['Import Tasks (CSV)', '📥', 'import'],
    ['Danger Zone', '⚠️', 'warning'],
    ['Clear All Tasks', '🗑️', 'trash'],
  ]],
]

// Representative page-title cleanups (45 titles + 4 headings total).
const TITLES = [
  ['📒 Accounting', 'Accounting'],
  ['🧾 Bills', 'Bills'],
  ['📊 Dashboard', 'Dashboard'],
  ['💸 Infra Spend', 'Infra Spend'],
  ['🏭 Warehouse Prospects', 'Warehouse Prospects'],
  ['✅ Bank Reconciliation', 'Bank Reconciliation'],
]

const rows = (items) => items.map(([label, before, after, note]) => `
  <tr>
    <td class="lbl">${label}</td>
    <td class="glyph emoji">${before ?? '<span class="none">—</span>'}</td>
    <td class="glyph after">${svg(after)}</td>
    <td class="name">${after}${note ? `<span class="note">${note}</span>` : ''}</td>
  </tr>`).join('')

const sections = SECTIONS.map(([title, sub, items]) => `
  <section>
    <h2>${title}</h2>
    <p class="sub">${sub}</p>
    <table>
      <thead><tr><th>Item</th><th>Before</th><th>After</th><th>Glyph</th></tr></thead>
      <tbody>${rows(items)}</tbody>
    </table>
  </section>`).join('')

const contact = Object.keys(ICONS).map((n) =>
  `<div class="cell">${svg(n, 22)}<span>${n}</span></div>`).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: letter; margin: 14mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; font-size: 11px; }
  header { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 2px solid #6366f1; }
  .mark { width: 38px; height: 38px; border-radius: 9px; background: linear-gradient(135deg, #4f46e5, #6366f1); color: #fff; display: flex; align-items: center; justify-content: center; }
  h1 { font-size: 21px; margin: 0; letter-spacing: -0.01em; }
  .meta { color: #64748b; font-size: 11px; margin-top: 2px; }
  .intro { color: #475569; font-size: 11.5px; line-height: 1.55; margin: 12px 0 0; max-width: 640px; }
  h2 { font-size: 14px; margin: 22px 0 2px; color: #312e81; }
  .sub { color: #64748b; margin: 0 0 8px; }
  section { break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 4.5px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr { break-inside: avoid; }
  .lbl { width: 32%; font-weight: 600; color: #374151; }
  .glyph { width: 14%; text-align: center; }
  .emoji { font-size: 15px; }
  .after { color: #4338ca; }
  .none { color: #cbd5e1; }
  .name { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #64748b; }
  .note { display: block; font-family: -apple-system, sans-serif; font-size: 9.5px; color: #94a3b8; margin-top: 1px; }
  .rules { display: flex; gap: 8px; margin-top: 10px; }
  .rule { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
  .rule b { display: block; color: #4338ca; font-size: 10.5px; margin-bottom: 2px; }
  .rule span { color: #64748b; font-size: 9.5px; line-height: 1.45; }
  .strip { display: flex; gap: 8px; align-items: center; margin: 10px 0 0; }
  .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 6px 11px; font-size: 11px; font-weight: 600; }
  .pill.light { background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; }
  .pill.solid { background: #6366f1; color: #fff; }
  .strip-note { color: #94a3b8; font-size: 10px; }
  .sheet { display: grid; grid-template-columns: repeat(8, 1fr); gap: 7px; margin-top: 10px; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 5px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 2px 7px; color: #1e293b; }
  .cell span { font-family: ui-monospace, Menlo, monospace; font-size: 8.5px; color: #64748b; }
  .titles td:first-child { color: #94a3b8; }
  .arrow { color: #cbd5e1; padding: 0 10px; }
</style></head><body>

<header>
  <div class="mark">${svg('logo', 22)}</div>
  <div>
    <h1>Blueprint custom iconography</h1>
    <div class="meta">Before / after · branch feat/custom-icons · June 10, 2026 · Raves Inc.</div>
  </div>
</header>

<p class="intro">Blueprint's interface chrome previously borrowed its iconography from the emoji set —
fast to ship, but mixed in weight, off-brand in color, and inconsistent across platforms. This pass
replaces every chrome emoji with a purpose-drawn SVG glyph set: one visual family, tinted by the
surrounding text color so it adapts to light and dark themes, with several glyphs drawn specifically
for Raves' business (a drafting set-square logomark, a storefront with awning for store prospects,
a hard hat for vendors). Card-level content emoji are unchanged by design.</p>

<div class="rules">
  <div class="rule"><b>One grid</b><span>Every glyph is drawn on a 24×24 grid with a shared safe margin, so icons align optically at any size.</span></div>
  <div class="rule"><b>One stroke</b><span>1.75px strokes, round caps and joins, no fills — the set reads as a single hand.</span></div>
  <div class="rule"><b>Theme-aware</b><span>Glyphs inherit the surrounding text color, so hover, active and dark mode tint them automatically.</span></div>
  <div class="rule"><b>Native-ready</b><span>Semantic names (board, ledger, spend…) map one-to-one to SF Symbols for the iOS app.</span></div>
</div>

<div class="strip">
  <span class="pill light">${svg('board', 13)} Kanban Board</span>
  <span class="pill solid">${svg('ledger', 12)} Overview</span>
  <span class="pill solid">${svg('pencil', 12)} New Task</span>
  <span class="strip-note">— drawer link, active section pill, and primary button, as styled in the app</span>
</div>

${sections}

<section>
  <h2>Page titles</h2>
  <p class="sub">45 page titles and 4 desktop headings carried a leading emoji; with the chrome now iconed, the prefixes were removed. Representative examples:</p>
  <table class="titles"><tbody>
    ${TITLES.map(([b, a]) => `<tr><td>${b}</td><td class="arrow">→</td><td><b>${a}</b></td></tr>`).join('')}
  </tbody></table>
</section>

<section>
  <h2>The full set</h2>
  <p class="sub">${Object.keys(ICONS).length} glyphs in src/lib/icons.ts, rendered by Icon.svelte. Invariants are pinned by icons.test.ts.</p>
  <div class="sheet">${contact}</div>
</section>

</body></html>`

// ── Print to PDF via headless Chrome ─────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'bp-icons-'))
const htmlPath = join(tmp, 'icons.html')
writeFileSync(htmlPath, html)
try {
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${OUT_PDF}`,
    htmlPath,
  ], { stdio: 'pipe' })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`wrote ${OUT_PDF}`)
