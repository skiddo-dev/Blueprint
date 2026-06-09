import { describe, it, expect, vi, afterEach } from 'vitest'
import { log, alertDue } from './log'

afterEach(() => vi.restoreAllMocks())

describe('log', () => {
  it('writes one JSON line with level, msg, fields and a ts', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error('boom', { id: 'abc', path: '/x' })
    expect(spy).toHaveBeenCalledTimes(1)
    const obj = JSON.parse(spy.mock.calls[0][0] as string)
    expect(obj).toMatchObject({ level: 'error', msg: 'boom', id: 'abc', path: '/x' })
    expect(typeof obj.ts).toBe('string')
  })

  it('routes info → console.log and warn → console.warn', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log.info('hi')
    log.warn('careful')
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

// The error-level alert sink dedups on the (static) message so a tight failure
// loop can't flood the channel: the same message pages at most once per window,
// and the clock is keyed per-message. alertDue is the pure decision behind it.
describe('alertDue (alert throttle/dedup)', () => {
  const WINDOW = 5 * 60_000

  it('fires the first time a message is seen (no prior record)', () => {
    expect(alertDue('boom', 1_000_000, new Map(), WINDOW)).toBe(true)
  })

  it('suppresses a repeat within the window, then fires again once it elapses', () => {
    const last = new Map<string, number>([['boom', 1_000_000]])
    expect(alertDue('boom', 1_000_000 + WINDOW - 1, last, WINDOW)).toBe(false) // still inside the window
    expect(alertDue('boom', 1_000_000 + WINDOW, last, WINDOW)).toBe(true)      // window elapsed
  })

  it('throttles each message independently', () => {
    const last = new Map<string, number>([['boom', 1_000_000]])
    expect(alertDue('boom', 1_000_050, last, WINDOW)).toBe(false) // recently alerted
    expect(alertDue('other', 1_000_050, last, WINDOW)).toBe(true) // different message, never alerted
  })
})
