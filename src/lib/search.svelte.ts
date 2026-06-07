// Tiny shared open-state store for the global search palette, so the NavDrawer
// button and the global ⌘K handler (in SearchPalette) both drive the same modal.
export const searchUI = $state({ open: false })

export function openSearch(): void {
  searchUI.open = true
}
