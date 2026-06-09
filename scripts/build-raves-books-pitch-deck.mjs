#!/usr/bin/env node
// Build the editable Blueprint Books (construction financial control) pitch deck.
//
// This is the sibling of build-raves-pitch-deck.mjs: same Raves Blueprint visual
// system, different offer. It sells the in-house accounting module
// (job-costed books, A/R + A/P, statements, period close, invoice/bill PDFs)
// as the next funded phase after Field Rollout + Reliability.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ARTIFACT_TOOL_MODULE =
  process.env.ARTIFACT_TOOL_MODULE ??
  'file:///Users/robertbice/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs'
const BUNDLED_NODE_MODULES =
  process.env.CODEX_BUNDLED_NODE_MODULES ??
  '/Users/robertbice/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'

const { Presentation, PresentationFile } = await import(ARTIFACT_TOOL_MODULE)
const requireFromBundled = createRequire(join(BUNDLED_NODE_MODULES, 'package.json'))
const sharp = requireFromBundled('sharp')

const DOCS = join(ROOT, 'docs')
const PPTX_OUT = join(DOCS, 'Blueprint Books Pitch Deck - Raves.pptx')
const PREVIEW_OUT = join(DOCS, 'Blueprint Books Pitch Deck - Raves Preview.png')
const WORKSPACE = join(
  ROOT,
  'outputs',
  process.env.CODEX_THREAD_ID ?? 'manual-raves-books-pitch-deck',
  'presentations',
  'raves-books-pitch-deck',
)
const PREVIEW_DIR = join(WORKSPACE, 'preview')

const W = 1280
const H = 720
const C = {
  navy: '#0B1F33',
  blue: '#145DA0',
  cyan: '#23A6D5',
  green: '#1D7F5F',
  amber: '#D98C16',
  red: '#B54545',
  ink: '#172033',
  gray: '#5F6F86',
  light: '#F5F8FC',
  line: '#D8E2ED',
  white: '#FFFFFF',
}

function addShape(slide, { x, y, w, h, fill, line = fill ?? C.white, geometry = 'rect' }) {
  return slide.shapes.add({
    geometry,
    position: { left: x, top: y, width: w, height: h },
    ...(fill ? { fill: { type: 'solid', color: fill } } : {}),
    line: { style: 'solid', fill: line, width: 0 },
  })
}

function addText(slide, text, x, y, w, h, style = {}) {
  const {
    size = 24,
    color = C.ink,
    align = 'left',
    valign = 'top',
    fill,
    bold = false,
    line,
  } = style
  const shape = addShape(slide, { x, y, w, h, fill, line: line ?? fill ?? C.white })
  shape.text = text
  shape.text.style = {
    fontFace: 'Aptos',
    fontSize: size,
    color,
    alignment: align,
    verticalAlignment: valign,
    bold,
  }
  return shape
}

function addHeader(slide, eyebrow, title, subtitle, dark = false) {
  const textColor = dark ? C.white : C.ink
  const muted = dark ? '#BFD6EA' : C.gray
  addText(slide, eyebrow.toUpperCase(), 72, 48, 740, 30, {
    size: 14,
    color: muted,
    bold: true,
  })
  addText(slide, title, 72, 86, 940, 92, {
    size: 36,
    color: textColor,
    bold: true,
  })
  if (subtitle) {
    addText(slide, subtitle, 72, 171, 940, 52, {
      size: 19,
      color: muted,
    })
  }
}

function addFooter(slide, index, dark = false) {
  const color = dark ? '#9FB9D2' : '#7B8798'
  addText(slide, 'Blueprint Books for Raves', 72, 672, 420, 24, {
    size: 12,
    color,
  })
  addText(slide, String(index).padStart(2, '0'), 1160, 672, 48, 24, {
    size: 12,
    color,
    align: 'right',
  })
}

function addBrand(slide) {
  addText(slide, 'RAVES', 1018, 52, 168, 28, {
    size: 22,
    color: C.white,
    align: 'right',
    bold: true,
  })
  addText(slide, 'Blueprint', 1018, 82, 168, 24, {
    size: 13,
    color: '#9FB9D2',
    align: 'right',
  })
}

function metric(slide, value, label, x, y, w, accent) {
  addShape(slide, { x, y, w, h: 122, fill: C.white, line: C.line })
  addShape(slide, { x, y, w: 7, h: 122, fill: accent })
  addText(slide, value, x + 28, y + 20, w - 48, 42, {
    size: 30,
    color: C.ink,
    bold: true,
  })
  addText(slide, label, x + 28, y + 66, w - 48, 40, {
    size: 14,
    color: C.gray,
  })
}

function bullet(slide, text, x, y, w, accent = C.cyan, color = C.ink) {
  addShape(slide, { x, y: y + 8, w: 10, h: 10, fill: accent })
  addText(slide, text, x + 22, y, w - 22, 42, { size: 18, color })
}

function lane(slide, title, items, x, y, w, accent) {
  addShape(slide, { x, y, w, h: 318, fill: C.white, line: C.line })
  addShape(slide, { x, y, w, h: 8, fill: accent })
  addText(slide, title, x + 26, y + 28, w - 52, 34, {
    size: 20,
    color: C.ink,
    bold: true,
  })
  items.forEach((item, i) => {
    bullet(slide, item, x + 28, y + 84 + i * 48, w - 54, accent)
  })
}

function smallCard(slide, title, body, x, y, w, h, accent) {
  addShape(slide, { x, y, w, h, fill: C.white, line: C.line })
  addShape(slide, { x, y, w: 6, h, fill: accent })
  addText(slide, title, x + 24, y + 20, w - 40, 30, {
    size: 18,
    color: C.ink,
    bold: true,
  })
  addText(slide, body, x + 24, y + 58, w - 42, h - 72, {
    size: 14,
    color: C.gray,
  })
}

function addTitleSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.navy })
  addShape(slide, { x: 0, y: 0, w: 16, h: H, fill: C.green })
  addBrand(slide)
  addText(slide, 'Blueprint Next Phase', 74, 92, 770, 70, {
    size: 18,
    color: '#A7CCE5',
    bold: true,
  })
  addText(slide, 'Blueprint Books', 72, 172, 880, 90, {
    size: 52,
    color: C.white,
    bold: true,
  })
  addText(slide, 'Construction financial control', 74, 256, 880, 52, {
    size: 26,
    color: '#9FE0C8',
    bold: true,
  })
  addText(
    slide,
    'Run job-costed books inside the platform Raves already uses, instead of spreadsheets and disconnected accounting.',
    76,
    324,
    820,
    96,
    { size: 23, color: '#D9EAF8' },
  )
  addShape(slide, { x: 78, y: 470, w: 520, h: 2, fill: '#2A7EB3' })
  addText(slide, 'Decision ask: approve the Books Foundation build and confirm the accounting owner and opening balances.', 76, 498, 720, 60, {
    size: 19,
    color: C.white,
  })
  addText(slide, 'Prepared for Raves Inc. / Raves Construction\nJune 9, 2026', 76, 600, 620, 54, {
    size: 15,
    color: '#9FB9D2',
  })
  addFooter(slide, 1, true)
}

function addProofSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addHeader(
    slide,
    'Why now',
    'The money already flows through Blueprint. The books do not yet.',
    'Quotes, vendors, and attachments live in Blueprint, but profit, A/R, and A/P still live in spreadsheets.',
  )
  metric(slide, '$9.3M', 'open value in the loaded quote log', 72, 262, 252, C.green)
  metric(slide, '536', 'loaded quote-log records', 354, 262, 252, C.blue)
  metric(slide, '48', 'task records driving job activity', 636, 262, 252, C.cyan)
  metric(slide, '23', 'email attachments (invoices, bills, POs)', 918, 262, 252, C.amber)
  metric(slide, '8 / 4', 'provisioned users / active last 7 days', 214, 434, 252, C.blue)
  metric(slide, '0', 'of that visible as job-costed books today', 514, 434, 252, C.red)
  metric(slide, '27', 'prospect records feeding future revenue', 814, 434, 252, C.amber)
  addFooter(slide, 2)
}

function addSystemMapSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addHeader(slide, 'System map', 'Turn work Raves already tracks into double-entry books.', null)
  lane(slide, 'What Blueprint already holds', ['Won quotes and contract value', 'Vendor bills and POs', 'Customer and vendor records', 'Job activity and attachments'], 72, 230, 300, C.cyan)
  lane(slide, 'Blueprint Books ledger', ['Job-costed chart of accounts', 'Invoices, payments, A/R aging', 'Bills, payments, A/P aging', 'Journal, trial balance, close'], 490, 230, 300, C.green)
  lane(slide, 'What Raves leadership sees', ['Profit per job, not guesses', 'Who owes us and what we owe', 'Tax-ready P&L and balance sheet', 'Clean, locked month-end'], 908, 230, 300, C.blue)
  addText(slide, '->', 402, 344, 58, 46, { size: 34, color: C.green, align: 'center', valign: 'middle', bold: true })
  addText(slide, '->', 820, 344, 58, 46, { size: 34, color: C.blue, align: 'center', valign: 'middle', bold: true })
  addFooter(slide, 3)
}

function addRiskSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.navy })
  addHeader(
    slide,
    'The gap',
    'The financial picture is stitched together by hand.',
    'The risk is not a lack of revenue. It is that revenue, cost, and cash live in separate places, so profit is a guess until the accountant catches up.',
    true,
  )
  addBrand(slide)
  smallCard(slide, 'Job profit is a guess', 'Costs sit in spreadsheets and email, so margin per job is only known late, if at all.', 72, 300, 252, 178, C.red)
  smallCard(slide, 'A/R slips', 'Without aging in the tool, slow-paying customers are noticed by feel, not by report.', 356, 300, 252, 178, C.amber)
  smallCard(slide, 'Retainage by hand', 'Retainage receivable and payable on construction jobs is tracked manually and easy to lose.', 640, 300, 252, 178, C.cyan)
  smallCard(slide, 'Month-end is manual', 'Closing the books means re-keying Blueprint data into separate accounting software.', 924, 300, 252, 178, C.blue)
  addText(slide, 'Recommended next funded phase: Blueprint Books Foundation.', 72, 544, 820, 44, {
    size: 23,
    color: C.white,
    bold: true,
  })
  addFooter(slide, 4, true)
}

function addDeliverSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addHeader(slide, 'What it delivers', 'A real set of construction books, already built into Blueprint.', null)
  const items = [
    ['Job-costed accounts', 'Construction chart of accounts: retainage, WIP, change orders, and job-cost categories.'],
    ['Invoices & A/R', 'Invoice customers from won quotes, record payments, and watch A/R aging buckets.'],
    ['Bills & A/P', 'Enter vendor bills, pay them, and watch what Raves owes with A/P aging.'],
    ['Ledger & trial balance', 'Double-entry journal and a live trial balance that always ties out to the penny.'],
    ['Statements', 'Income statement and balance sheet on demand, no re-keying into other software.'],
    ['Close & PDFs', 'Lock a period when it is final, and send branded invoice and bill PDFs.'],
  ]
  items.forEach(([title, body], i) => {
    const x = 72 + (i % 3) * 384
    const y = i < 3 ? 248 : 452
    smallCard(slide, title, body, x, y, 332, 150, [C.green, C.cyan, C.amber, C.blue, C.green, C.cyan][i])
  })
  addFooter(slide, 5)
}

// Walkthrough screenshots: docs/books-screenshots/ (2x captures of the deployed
// V3 UI over seeded demo books — see that folder's README for the cast/recipe).
const SHOTS_DIR = join(DOCS, 'books-screenshots')
const SHOT_ASPECT = 1900 / 3000

function addScreenshot(slide, file, x, y, w, caption) {
  const h = Math.round(w * SHOT_ASPECT)
  addShape(slide, { x: x - 2, y: y - 2, w: w + 4, h: h + 4, fill: C.line })
  const img = slide.images.add({
    data: readFileSync(join(SHOTS_DIR, file)),
    contentType: 'image/png',
  })
  img.position = { left: x, top: y, width: w, height: h }
  if (caption) {
    addText(slide, caption, x, y + h + 10, w + 20, 40, { size: 13, color: C.gray, fill: C.light })
  }
  return h
}

function addWalkthroughHeroSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addScreenshot(slide, '01-overview.png', 72, 204, 720)
  addHeader(
    slide,
    'Product walkthrough',
    'Already built — this is the live product, not a mockup.',
    'Screenshots from the deployed module with demo books loaded; every figure ties out.',
  )
  smallCard(slide, 'Money at a glance', 'Cash, A/R, A/P, and profit — each with month-over-month direction.', 860, 204, 348, 120, C.green)
  smallCard(slide, 'Trend, not guesswork', 'Six months of revenue vs expenses, with net income per month.', 860, 340, 348, 120, C.cyan)
  smallCard(slide, 'Urgency built in', 'Overdue invoices and bills due this week surface themselves.', 860, 476, 348, 120, C.amber)
  addFooter(slide, 6)
}

function addWalkthroughFlowsSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addHeader(slide, 'Product walkthrough', 'From invoice to clean statements.', null)
  addScreenshot(slide, '02-invoices.png', 72, 206, 368, 'Invoices: status filters, overdue flags, payment progress')
  addScreenshot(slide, '04-income-statement.png', 456, 206, 368, 'Income statement: one-click periods, print for the bank')
  addScreenshot(slide, '08-reconcile.png', 840, 206, 368, 'Bank reconciliation: tick to zero, CSV auto-match')
  smallCard(
    slide,
    'Also in the product',
    'Vendor bills and A/P, customer and vendor directories, A/R + A/P aging, balance sheet, cash flow, journal and trial balance, period close, invoice/bill PDFs, dark mode.',
    72,
    512,
    1136,
    110,
    C.blue,
  )
  addFooter(slide, 7)
}

function addCommercialSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addHeader(slide, 'Commercial path', 'One clean foundation build, then an optional close-support lane.', null)
  addShape(slide, { x: 72, y: 246, w: 512, h: 284, fill: C.navy })
  addText(slide, 'Blueprint Books Foundation', 110, 286, 430, 56, {
    size: 24,
    color: C.white,
    bold: true,
  })
  addText(slide, '$18,500 fixed fee', 110, 356, 420, 54, {
    size: 38,
    color: '#9FE0C8',
    bold: true,
  })
  addText(slide, '50% start / 50% closeout\n4-5 weeks from opening-balance readiness', 112, 424, 410, 66, {
    size: 18,
    color: '#D9EAF8',
  })
  smallCard(slide, 'Books Complete', '$28,000 adds bank reconciliation, cash-flow statement, data migration from current books, and 30-day hypercare.', 646, 246, 250, 172, C.amber)
  smallCard(slide, 'Books Care', 'Optional monthly lane for month-end review, reconciliation checks, and small accounting changes.', 930, 246, 250, 172, C.green)
  smallCard(slide, 'Builds on what is shipped', 'The ledger, A/R, A/P, statements, period close, and invoice/bill PDFs are already built. This phase tailors and rolls them out for Raves.', 646, 456, 534, 120, C.blue)
  addFooter(slide, 8)
}

function addMapSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.light })
  addHeader(slide, 'Mutual action plan', 'A simple path from decision to first clean month-end.', null)
  const steps = [
    ['1', 'Select package', 'Confirm Books Foundation or the expanded Books Complete scope.'],
    ['2', 'Approve SOW', 'Name the approval owner and target decision date.'],
    ['3', 'Confirm inputs', 'Accounting owner, opening balances, chart-of-accounts review, and tax/entity basics.'],
    ['4', 'Implement', 'Tailor the books, load opening balances, wire A/R and A/P, and train the team.'],
    ['5', 'First close', 'Run the first month-end in Blueprint and lock the period.'],
  ]
  steps.forEach(([num, title, body], i) => {
    const x = 72 + i * 232
    addShape(slide, { x, y: 280, w: 176, h: 176, fill: C.white, line: C.line })
    addShape(slide, { x: x + 18, y: 304, w: 44, h: 44, fill: [C.green, C.blue, C.amber, C.cyan, C.green][i] })
    addText(slide, num, x + 18, 311, 44, 30, {
      size: 20,
      color: C.white,
      align: 'center',
      bold: true,
    })
    addText(slide, title, x + 18, 370, 136, 32, {
      size: 17,
      color: C.ink,
      bold: true,
    })
    addText(slide, body, x + 18, 410, 136, 78, {
      size: 12,
      color: C.gray,
    })
    if (i < steps.length - 1) {
      addText(slide, '->', x + 184, 348, 34, 34, {
        size: 22,
        color: C.blue,
        align: 'center',
        valign: 'middle',
        bold: true,
      })
    }
  })
  addFooter(slide, 9)
}

function addAskSlide(presentation) {
  const slide = presentation.slides.add()
  addShape(slide, { x: 0, y: 0, w: W, h: H, fill: C.navy })
  addShape(slide, { x: 0, y: 0, w: W, h: 12, fill: C.green })
  addBrand(slide)
  addHeader(slide, 'Decision', 'Approve Blueprint Books as the next funded phase.', 'Leave with one owner, one date, and the opening-balance source.', true)
  addShape(slide, { x: 90, y: 284, w: 1100, h: 184, fill: '#123A5B' })
  addText(slide, 'Ask', 126, 314, 160, 36, {
    size: 20,
    color: '#9FE0C8',
    bold: true,
  })
  addText(slide, 'Approve the Books Foundation build at $18,500 fixed fee.', 126, 356, 920, 58, {
    size: 30,
    color: C.white,
    bold: true,
  })
  addText(slide, 'Then confirm the approver, target decision date, the accounting owner, and where opening balances and the chart of accounts come from.', 126, 424, 950, 48, {
    size: 18,
    color: '#D9EAF8',
  })
  smallCard(slide, 'Next artifact', 'One-page Books SOW and opening-balance checklist.', 160, 532, 280, 96, C.green)
  smallCard(slide, 'Next meeting', 'Kickoff once opening balances are confirmed.', 500, 532, 280, 96, C.cyan)
  smallCard(slide, 'Next offer', 'Books Care after go-live for monthly close support.', 840, 532, 280, 96, C.amber)
  addFooter(slide, 10, true)
}

async function writeBlob(blob, path) {
  if (typeof blob.save === 'function') {
    await blob.save(path)
    return
  }
  writeFileSync(path, Buffer.from(await blob.arrayBuffer()))
}

async function exportPreviews(presentation) {
  rmSync(PREVIEW_DIR, { recursive: true, force: true })
  mkdirSync(PREVIEW_DIR, { recursive: true })
  const thumbs = []
  for (const [i, slide] of presentation.slides.items.entries()) {
    const blob = await slide.export({ format: 'png', scale: 0.4 })
    const pngPath = join(PREVIEW_DIR, `slide-${String(i + 1).padStart(2, '0')}.png`)
    await writeBlob(blob, pngPath)
    const resized = await sharp(pngPath).resize(512, 288).png().toBuffer()
    thumbs.push({ input: resized, top: 48 + Math.floor(i / 2) * 344, left: 48 + (i % 2) * 592 })
  }

  const rows = Math.ceil(thumbs.length / 2)
  await sharp({
    create: {
      width: 1152,
      height: 48 + rows * 344,
      channels: 4,
      background: '#F5F8FC',
    },
  })
    .composite(thumbs)
    .png()
    .toFile(PREVIEW_OUT)
}

const presentation = Presentation.create({ title: 'Blueprint Books Pitch Deck - Raves' })
addTitleSlide(presentation)
addProofSlide(presentation)
addSystemMapSlide(presentation)
addRiskSlide(presentation)
addDeliverSlide(presentation)
addWalkthroughHeroSlide(presentation)
addWalkthroughFlowsSlide(presentation)
addCommercialSlide(presentation)
addMapSlide(presentation)
addAskSlide(presentation)

mkdirSync(dirname(PPTX_OUT), { recursive: true })
await writeBlob(await PresentationFile.exportPptx(presentation), PPTX_OUT)
await exportPreviews(presentation)

console.log(`[ok] ${PPTX_OUT}`)
console.log(`[ok] ${PREVIEW_OUT}`)
console.log(`[ok] Preview slides: ${PREVIEW_DIR}`)
