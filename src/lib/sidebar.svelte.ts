// Reactive collapse-state for the desktop sidebar (NavDrawer). Persisted to
// localStorage so a hidden sidebar stays hidden across reloads and across pages.
// Mobile is unaffected — there the sidebar is an off-canvas drawer driven by its
// own `open` flag and the ☰ button, so the collapse rule is scoped to ≥769px.
import { browser } from '$app/environment'

const STORAGE_KEY = 'blueprint:sidebar-collapsed'

// Read the stored preference at module load. On the client this runs before the
// drawer first paints, so a collapsed sidebar never flashes open on navigation.
function readStored(): boolean {
  if (!browser) return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false // storage may be unavailable (private mode)
  }
}

export const sidebarUI = $state({ collapsed: readStored() })

export function setSidebarCollapsed(collapsed: boolean): void {
  sidebarUI.collapsed = collapsed
  if (!browser) return
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    /* storage may be unavailable — the collapse still applies for the session */
  }
}

export function toggleSidebar(): void {
  setSidebarCollapsed(!sidebarUI.collapsed)
}
