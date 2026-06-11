// Promise-based replacement for window.confirm() — ConfirmDialog.svelte in the
// root layout renders whatever is pending here, so call sites stay one-liners:
//
//   if (!(await confirmDialog({ title: 'Void invoice 1042?', danger: true }))) return
//
// Native confirm() was the last undesigned surface in the destructive flows:
// it ignores the theme, the focus-trap work, and the danger color language.

export interface ConfirmSpec {
  /** The question, phrased as the action ("Void invoice 1042?"). */
  title: string
  /** Supporting copy under the title — consequences, not repetition. */
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive ask: danger styling, and initial focus lands on Cancel. */
  danger?: boolean
}

interface PendingConfirm extends ConfirmSpec {
  resolve: (ok: boolean) => void
}

export const confirmUI = $state<{ pending: PendingConfirm | null }>({ pending: null })

export function confirmDialog(spec: ConfirmSpec): Promise<boolean> {
  // A second ask while one is open would orphan the first promise — settle it
  // as cancelled rather than ever leaving a caller hanging.
  confirmUI.pending?.resolve(false)
  return new Promise((resolve) => {
    confirmUI.pending = { ...spec, resolve }
  })
}

export function settleConfirm(ok: boolean): void {
  const p = confirmUI.pending
  if (!p) return
  confirmUI.pending = null
  p.resolve(ok)
}
