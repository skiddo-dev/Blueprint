#!/usr/bin/env node
// Build the user-guide PDFs from their Markdown sources.
//
// Pipeline (matches how the originals were made — Skia/PDF via HeadlessChrome):
//   docs/<name>.md  --marked-->  styled HTML  --Chrome --print-to-pdf-->  PDF
// Output lands in BOTH docs/ (the source-of-truth copy) and static/guides/
// (the copy the in-app "📖 Help & Guide" link serves).
//
// Usage:  node scripts/build-guides.mjs
// Requires: Google Chrome installed; `npx marked` (fetched on demand).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const GUIDES = [
  { name: 'admin-user-guide', title: 'Blueprint — Administrator Guide' },
  { name: 'pm-user-guide', title: 'Blueprint — Project Manager Guide' },
]

// Render Markdown → HTML body via the `marked` CLI (GFM tables/blockquotes on).
function mdToHtml(mdPath) {
  return execFileSync('npx', ['--yes', 'marked', '--gfm', '-i', mdPath], {
    encoding: 'utf8',
    cwd: ROOT,
    maxBuffer: 8 * 1024 * 1024,
  })
}

// Print-ready wrapper. Indigo brand accent (#4f46e5) matching the app.
function page(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  @page { margin: 0.85in 0.8in; }
  * { box-sizing: border-box; }
  body {
    font: 10.8pt/1.55 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1f2937; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 22pt; color: #4338ca; margin: 0 0 .35em; padding-bottom: .25em;
       border-bottom: 2px solid #4f46e5; }
  h2 { font-size: 15pt; color: #4f46e5; margin: 1.6em 0 .5em; padding-bottom: .2em;
       border-bottom: 1px solid #e5e7eb; break-after: avoid; }
  h3 { font-size: 12.5pt; color: #374151; margin: 1.2em 0 .4em; break-after: avoid; }
  p, li { orphans: 2; widows: 2; }
  ul, ol { padding-left: 1.4em; }
  li { margin: .18em 0; }
  a { color: #4f46e5; text-decoration: none; }
  strong { color: #111827; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.4pt;
    background: #f3f4f6; padding: .08em .35em; border-radius: 4px; color: #be185d;
  }
  blockquote {
    margin: .9em 0; padding: .55em .9em; background: #f5f6ff;
    border-left: 3px solid #4f46e5; border-radius: 0 6px 6px 0; color: #374151;
  }
  blockquote p { margin: .25em 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.6em 0; }
  table {
    border-collapse: collapse; width: 100%; margin: .8em 0; font-size: 10pt;
    break-inside: avoid;
  }
  th, td { border: 1px solid #e5e7eb; padding: .4em .6em; text-align: left; vertical-align: top; }
  th { background: #eef2ff; color: #4338ca; font-weight: 700; }
  tr:nth-child(even) td { background: #fafafa; }
</style></head>
<body>${bodyHtml}</body></html>`
}

const tmp = mkdtempSync(join(tmpdir(), 'guides-'))
for (const g of GUIDES) {
  const mdPath = join(ROOT, 'docs', `${g.name}.md`)
  const html = page(g.title, mdToHtml(mdPath))
  const htmlPath = join(tmp, `${g.name}.html`)
  writeFileSync(htmlPath, html)

  const outPdf = join(ROOT, 'docs', `${g.name}.pdf`)
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${outPdf}`,
    `file://${htmlPath}`,
  ], { stdio: 'ignore' })

  // Mirror to the served location.
  copyFileSync(outPdf, join(ROOT, 'static', 'guides', `${g.name}.pdf`))
  const kb = (readFileSync(outPdf).length / 1024).toFixed(0)
  console.log(`✓ ${g.name}.pdf  (${kb} KB)  → docs/ + static/guides/`)
}
console.log('Done.')
