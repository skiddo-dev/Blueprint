// Global toast store — the app's one event-feedback channel (inline `role="alert"`
// text stays the pattern for form validation, which belongs next to its field).
// Rendered by Toasts.svelte in the root layout.
//
// Destructive flows use the staged-undo pattern: the caller hides the affected
// rows optimistically and passes the server write as `onExpire`, which runs
// exactly once when the toast leaves WITHOUT the user pressing Undo (timeout,
// manual dismiss, or a programmatic flush). Undo runs `undo` instead and the
// write never happens.

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

export interface ToastOptions {
  /** ms before auto-dismiss; 0 = sticky until dismissed. */
  duration?: number
  /** Adds an Undo button; pressing it suppresses onExpire. */
  undo?: () => void
  /** The deferred commit — runs once when the toast leaves without Undo. */
  onExpire?: () => void
}

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  duration: number
  undo?: () => void
  onExpire?: () => void
}

const DEFAULT_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 6000,
}
const UNDO_MS = 7000 // a beat longer when there's a decision to make

export const toasts = $state<ToastItem[]>([])

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function remove(id: number): ToastItem | undefined {
  const idx = toasts.findIndex(t => t.id === id)
  if (idx === -1) return undefined
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  return toasts.splice(idx, 1)[0]
}

export function show(kind: ToastKind, message: string, opts: ToastOptions = {}): number {
  // Identical back-to-back notices (e.g. every 2s-poll write failing offline)
  // restart the existing toast instead of stacking copies. Undo toasts always
  // stack — each one owns a distinct deferred commit.
  if (!opts.undo && !opts.onExpire) {
    const dup = toasts.find(t => t.kind === kind && t.message === message && !t.undo && !t.onExpire)
    if (dup) {
      const timer = timers.get(dup.id)
      if (timer) clearTimeout(timer)
      if (dup.duration > 0) timers.set(dup.id, setTimeout(() => dismiss(dup.id), dup.duration))
      return dup.id
    }
  }

  const id = nextId++
  const duration = opts.duration ?? (opts.undo ? UNDO_MS : DEFAULT_MS[kind])
  toasts.push({ id, kind, message, duration, undo: opts.undo, onExpire: opts.onExpire })
  if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration))
  return id
}

/** Close a toast without Undo — the deferred commit (if any) proceeds. */
export function dismiss(id: number): void {
  remove(id)?.onExpire?.()
}

/** Press Undo: run the caller's restore and drop the commit. */
export function undo(id: number): void {
  remove(id)?.undo?.()
}

export const toast = {
  show,
  dismiss,
  undo,
  success: (message: string, opts?: ToastOptions) => show('success', message, opts),
  info: (message: string, opts?: ToastOptions) => show('info', message, opts),
  warning: (message: string, opts?: ToastOptions) => show('warning', message, opts),
  error: (message: string, opts?: ToastOptions) => show('error', message, opts),
}
