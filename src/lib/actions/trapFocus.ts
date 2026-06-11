// Svelte action for dialogs: keep Tab inside the dialog while it's open, and
// give focus back to whatever opened it when it closes. Pointer access to the
// page behind is already blocked by each dialog's backdrop, and aria-modal
// scopes the screen-reader virtual cursor — this action closes the remaining
// gap, the keyboard.
//
//   <div class="modal" role="dialog" aria-modal="true" use:trapFocus>
//
// Initial focus: the dialog's [autofocus] element if it has one, otherwise the
// dialog container itself (so screen readers announce the aria-label first and
// the first Tab lands on the first control). Components that focus something
// themselves on mount (e.g. the search palette's input) win — the action never
// steals focus that's already inside the dialog.

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), ' +
  'select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function trapFocus(node: HTMLElement) {
  const opener = document.activeElement as HTMLElement | null

  const focusables = () =>
    [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      el => el.getClientRects().length > 0,
    )

  // After the dialog has rendered (autofocus attributes included).
  queueMicrotask(() => {
    if (node.contains(document.activeElement)) return
    const target = node.querySelector<HTMLElement>('[autofocus]')
    if (target) {
      target.focus()
    } else {
      node.tabIndex = -1
      node.focus()
    }
  })

  // On document (capture), not the node: a click on a non-focusable part of
  // the dialog can blur focus to <body>, and the next Tab must still cycle
  // back into the dialog instead of walking the page behind it.
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const els = focusables()
    if (!els.length) return
    const first = els[0]
    const last = els[els.length - 1]
    const active = document.activeElement
    const inside = node.contains(active)
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault()
      first.focus()
    }
  }
  document.addEventListener('keydown', onKeydown, true)

  return {
    destroy() {
      document.removeEventListener('keydown', onKeydown, true)
      if (opener?.isConnected) opener.focus()
    },
  }
}
