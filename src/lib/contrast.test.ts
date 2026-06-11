import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// WCAG contrast regression — parses the real token values out of app.css for
// BOTH themes and asserts every designed ink-on-fill pair stays readable. The
// design-system greps catch structural drift; this catches a well-intentioned
// "just lighten it a touch" palette edit that quietly breaks readability.
//
// Thresholds: 4.5:1 (WCAG AA, normal text) for body/chip ink; 3:1 (AA large
// text / graphical objects) for --text-faint, which is restricted to
// placeholders, timestamps, and glyphs — never essential body copy — and for
// white on the primary-button gradient (16px+ bold equivalent at weight 600).

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')

function tokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2]
  // One-hop aliases like --link: var(--primary-dark) resolve against the same
  // block; cross-theme resolution happens after the dark merge below.
  for (const m of block.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\)/g)) out[m[1]] = `@${m[2]}`
  return out
}

function resolve(theme: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(theme)) out[k] = v.startsWith('@') ? theme[v.slice(1)] : v
  return out
}

const darkStart = css.indexOf(':root[data-theme="dark"]')
const light = resolve(tokensIn(css.slice(0, darkStart)))
// Dark inherits anything it doesn't override.
const dark = resolve({ ...tokensIn(css.slice(0, darkStart)), ...tokensIn(css.slice(darkStart)) })

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

// [ink, fill, minimum] — token names except literal #fff (sanctioned invariant
// on solid indigo/navy fills).
const PAIRS: [string, string, number][] = [
  // Text ramp on both surfaces
  ['text', 'bg', 4.5],
  ['text', 'card-bg', 4.5],
  ['text-body', 'bg', 4.5],
  ['text-body', 'card-bg', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'card-bg', 4.5],
  ['text-soft', 'bg', 4.5],
  ['text-soft', 'card-bg', 4.5],
  // Tertiary: placeholders / glyphs / timestamps only (see header note)
  ['text-faint', 'bg', 3],
  ['text-faint', 'card-bg', 3],
  // Brand inks on brand fills
  ['primary-text', 'primary-bg', 4.5],
  ['primary-text', 'chip-bg', 4.5],
  // Link/active ink everywhere it sits
  ['link', 'bg', 4.5],
  ['link', 'card-bg', 4.5],
  ['link', 'primary-bg', 4.5],
  // Status chips: ink on soft fill
  ['success', 'success-bg', 4.5],
  ['warning', 'warning-bg', 4.5],
  ['danger', 'danger-bg', 4.5],
  ['danger', 'danger-bg-subtle', 4.5],
  ['info', 'info-bg', 4.5],
]

const FIXED: [string, string, number][] = [
  // White button/chip text on the solid brand fills
  ['#ffffff', 'primary-dark', 4.5],
  ['#ffffff', 'primary', 3],
  ['#ffffff', 'store-chip', 4.5],
]

for (const [name, theme] of [['light', light], ['dark', dark]] as const) {
  describe(`contrast — ${name} theme`, () => {
    it.each(PAIRS)('--%s on --%s ≥ %s:1', (ink, fill, min) => {
      const r = ratio(theme[ink], theme[fill])
      expect(r, `--${ink} (${theme[ink]}) on --${fill} (${theme[fill]}) = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
    })
    it.each(FIXED)('%s on --%s ≥ %s:1', (ink, fill, min) => {
      const r = ratio(ink, theme[fill])
      expect(r, `${ink} on --${fill} (${theme[fill]}) = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
    })
  })
}
