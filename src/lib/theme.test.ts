import { describe, it, expect } from 'vitest'
import { resolveTheme, nextTheme, chartInk } from './theme'

describe('resolveTheme', () => {
  it('passes through explicit light/dark', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('maps system to the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('nextTheme', () => {
  it('cycles light → dark → system → light', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })
})

describe('chartInk', () => {
  it('returns distinct tick/grid colors per theme', () => {
    const light = chartInk('light')
    const dark = chartInk('dark')
    expect(light.tick).not.toBe(dark.tick)
    expect(light.grid).not.toBe(dark.grid)
  })
})
