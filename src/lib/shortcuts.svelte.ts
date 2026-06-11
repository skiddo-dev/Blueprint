// Shared open-state for the keyboard-shortcuts overlay (same pattern as
// $lib/search.svelte) — the global `?` handler, the ⌘K command, and the
// overlay itself all drive one flag.
export const shortcutsUI = $state({ open: false })

export function openShortcuts(): void {
  shortcutsUI.open = true
}
