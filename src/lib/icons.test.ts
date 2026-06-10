import { describe, it, expect } from 'vitest'
import { ICONS } from './icons'

// The icon set is raw SVG markup injected via {@html}, so these tests pin the
// invariants the Icon component relies on: bare stroke geometry only — no
// styling attributes, no event handlers, nothing that isn't a shape element.
describe('icons', () => {
  const entries = Object.entries(ICONS)

  it('every glyph contains only plain shape elements', () => {
    // Tags must be one of the basic shapes; attributes drawn from the small
    // geometry whitelist (no fill/stroke/style/on* — the wrapper owns styling).
    const TAG = /<(\/?)(path|rect|circle|ellipse)\b([^<>]*)>/g
    const ATTR = /([a-zA-Z-]+)="[^"]*"/g
    const ALLOWED_ATTRS = new Set(['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r'])
    for (const [name, markup] of entries) {
      // Strip all valid shape tags; nothing may remain.
      const leftover = markup.replace(TAG, '').trim()
      expect(leftover, `${name} has non-shape content`).toBe('')
      for (const tag of markup.matchAll(TAG)) {
        for (const attr of (tag[3] ?? '').matchAll(ATTR)) {
          expect(ALLOWED_ATTRS.has(attr[1]), `${name} uses attribute ${attr[1]}`).toBe(true)
        }
      }
    }
  })

  it('path data uses only valid SVG path syntax', () => {
    for (const [name, markup] of entries) {
      for (const m of markup.matchAll(/ d="([^"]*)"/g)) {
        expect(m[1], `${name} has malformed path data`).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$/)
        // Path data must start with a moveto.
        expect(m[1].trimStart(), `${name} path must start with M/m`).toMatch(/^[Mm]/)
      }
    }
  })

  it('numeric shape attributes stay on the 24×24 grid', () => {
    for (const [name, markup] of entries) {
      for (const m of markup.matchAll(/(?:[xy]|c[xy]|r[xy]?|width|height)="([^"]*)"/g)) {
        const v = Number(m[1])
        expect(Number.isFinite(v), `${name}: non-numeric attribute ${m[0]}`).toBe(true)
        expect(v, `${name}: ${m[0]} outside the grid`).toBeGreaterThanOrEqual(0)
        expect(v, `${name}: ${m[0]} outside the grid`).toBeLessThanOrEqual(24)
      }
    }
  })

  it('keeps the names the navigation chrome depends on', () => {
    // NavDrawer + AccountingShell + Sidebar reference these; renaming a glyph
    // without updating the callers would render an empty <svg>.
    const required = [
      'logo', 'board', 'dashboard', 'quote', 'ledger', 'spend', 'prospects', 'map',
      'search', 'guide', 'invoice', 'users', 'trend-up', 'trend-down', 'bill', 'po',
      'vendors', 'reports', 'budget', 'tax', 'audit', 'deposit', 'reconcile',
      'recurring', 'asset', 'menu', 'x', 'check', 'plus', 'bell', 'eye', 'import',
      'warning', 'trash', 'person', 'list', 'sliders', 'refresh', 'pencil',
      'sun', 'moon', 'monitor',
    ] as const
    for (const name of required) expect(ICONS[name], `missing icon: ${name}`).toBeTruthy()
  })
})
