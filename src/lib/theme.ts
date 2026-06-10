// Theme model — pure, DOM-free helpers (the reactive store + DOM side-effects
// live in theme.svelte.ts; the no-flash boot script in app.html mirrors this
// logic inline). Kept pure so it's trivially unit-testable.

export type Theme = 'light' | 'dark' | 'system'
export type Resolved = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'blueprint:theme'

// Cycle order for the toggle button.
const ORDER: Theme[] = ['light', 'dark', 'system']

/** Collapse a preference (which may be 'system') to a concrete light/dark theme. */
export function resolveTheme(pref: Theme, systemPrefersDark: boolean): Resolved {
  return pref === 'system' ? (systemPrefersDark ? 'dark' : 'light') : pref
}

/** Next preference in the light → dark → system cycle. */
export function nextTheme(pref: Theme): Theme {
  return ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]
}

export function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark' || v === 'system'
}

// <meta name="theme-color"> value per resolved theme (browser UI chrome tint).
export const THEME_COLOR: Record<Resolved, string> = { light: '#6366f1', dark: '#0b1220' }

/** Chart.js axis-text + gridline + segment-border colors per theme. Chart.js
 *  draws to a canvas and can't read CSS vars, so these mirror the
 *  --text-muted / --border / --card-bg tokens. */
export function chartInk(resolved: Resolved): { tick: string; grid: string; card: string } {
  return resolved === 'dark'
    ? { tick: '#94a3b8', grid: 'rgba(148, 163, 184, 0.16)', card: '#1e293b' }
    : { tick: '#64748b', grid: '#e2e8f0', card: '#ffffff' }
}
