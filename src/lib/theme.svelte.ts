// Reactive theme store + DOM side-effects. Components import `theme` for
// reactivity and call `cycleTheme` / `initTheme`. Pure logic lives in ./theme.
import { browser } from '$app/environment'
import {
  type Theme,
  type Resolved,
  THEME_STORAGE_KEY,
  THEME_COLOR,
  resolveTheme,
  nextTheme,
  isTheme,
} from './theme'

function systemPrefersDark(): boolean {
  return browser && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Current preference + the concrete theme it resolves to. Read `.resolved` for
// canvas colors (charts), `.pref` for the toggle label.
export const theme = $state<{ pref: Theme; resolved: Resolved }>({
  pref: 'system',
  resolved: 'light',
})

/** Apply a preference: sync the store, then (client only) the <html> data-theme,
 *  localStorage, and the theme-color meta. */
export function setTheme(pref: Theme): void {
  const resolved = resolveTheme(pref, systemPrefersDark())
  theme.pref = pref
  theme.resolved = resolved
  if (!browser) return
  document.documentElement.dataset.theme = resolved
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    /* storage may be unavailable (private mode) — theme still applies for the session */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}

export function cycleTheme(): void {
  setTheme(nextTheme(theme.pref))
}

/** Sync the store from storage on mount and re-resolve when the OS theme changes
 *  while the user is on 'system'. Returns a teardown for the layout's $effect.
 *  The boot script in app.html already set data-theme pre-paint (no flash); this
 *  just brings the reactive store in line and wires the live listener. */
export function initTheme(): (() => void) | void {
  if (!browser) return
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  setTheme(isTheme(stored) ? stored : 'system')
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (theme.pref === 'system') setTheme('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
