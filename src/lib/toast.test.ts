import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toasts, toast } from './toast.svelte'

// The store is module-global; start each test from an empty stack.
beforeEach(() => {
  vi.useFakeTimers()
  toasts.splice(0)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('toast store', () => {
  it('shows and auto-dismisses after the kind default', () => {
    toast.success('Saved')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ kind: 'success', message: 'Saved', duration: 4000 })
    vi.advanceTimersByTime(3999)
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts).toHaveLength(0)
  })

  it('errors stay up longer than successes', () => {
    toast.error('Nope')
    expect(toasts[0].duration).toBe(6000)
  })

  it('duration 0 sticks until dismissed', () => {
    const id = toast.info('Sticky', { duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(toasts).toHaveLength(1)
    toast.dismiss(id)
    expect(toasts).toHaveLength(0)
  })

  it('dedupes identical consecutive notices and restarts the clock', () => {
    toast.error('Couldn’t save')
    vi.advanceTimersByTime(5000) // 1s left
    toast.error('Couldn’t save') // the 2s-poll failing again
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(5999) // would have expired twice over without restart
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts).toHaveLength(0)
  })

  it('never dedupes undo toasts — each owns its own commit', () => {
    toast.success('Task deleted', { undo: () => {}, onExpire: () => {} })
    toast.success('Task deleted', { undo: () => {}, onExpire: () => {} })
    expect(toasts).toHaveLength(2)
  })

  it('expiry runs the deferred commit exactly once', () => {
    const commit = vi.fn()
    toast.success('Task deleted', { undo: () => {}, onExpire: commit })
    vi.advanceTimersByTime(7000)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(toasts).toHaveLength(0)
  })

  it('manual dismiss also commits (the action proceeds)', () => {
    const commit = vi.fn()
    const id = toast.success('Task archived', { undo: () => {}, onExpire: commit })
    toast.dismiss(id)
    expect(commit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000) // the cleared timer must not re-fire it
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('undo restores and suppresses the commit', () => {
    const commit = vi.fn()
    const restore = vi.fn()
    const id = toast.success('Task deleted', { undo: restore, onExpire: commit })
    toast.undo(id)
    expect(restore).toHaveBeenCalledTimes(1)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(commit).not.toHaveBeenCalled()
    expect(toasts).toHaveLength(0)
  })
})
