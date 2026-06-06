import { describe, it, expect, vi, afterEach } from 'vitest'
import { log } from './log'

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
