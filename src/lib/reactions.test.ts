import { describe, it, expect } from 'vitest'
import { toggleReactor, isReactionEmoji } from './reactions'

describe('toggleReactor', () => {
  it('adds a reactor to an empty/absent emoji', () => {
    expect(toggleReactor(undefined, '👍', 'Ben')).toEqual({ '👍': ['Ben'] })
    expect(toggleReactor({}, '👍', 'Ben')).toEqual({ '👍': ['Ben'] })
  })

  it('appends a second reactor', () => {
    expect(toggleReactor({ '👍': ['Ben'] }, '👍', 'Kris')).toEqual({ '👍': ['Ben', 'Kris'] })
  })

  it('removes a reactor when already present', () => {
    expect(toggleReactor({ '👍': ['Ben', 'Kris'] }, '👍', 'Ben')).toEqual({ '👍': ['Kris'] })
  })

  it('drops the emoji bucket when the last reactor leaves', () => {
    expect(toggleReactor({ '👍': ['Ben'] }, '👍', 'Ben')).toEqual({})
  })

  it('leaves other emojis untouched', () => {
    expect(toggleReactor({ '👍': ['Ben'], '🎉': ['Kris'] }, '👍', 'Ben')).toEqual({ '🎉': ['Kris'] })
  })

  it('does not mutate the input', () => {
    const input = { '👍': ['Ben'] }
    toggleReactor(input, '👍', 'Kris')
    expect(input).toEqual({ '👍': ['Ben'] })
  })
})

describe('isReactionEmoji', () => {
  it('accepts known emojis and rejects others', () => {
    expect(isReactionEmoji('👍')).toBe(true)
    expect(isReactionEmoji('🚀')).toBe(false)
    expect(isReactionEmoji('')).toBe(false)
    expect(isReactionEmoji(5)).toBe(false)
  })
})
