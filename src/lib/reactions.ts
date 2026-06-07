// Emoji reactions on card comments. The reaction set is fixed (no full picker in
// v1). `toggleReactor` is pure so both the API (authoritative) and the optimistic
// UI can share it.

export const REACTION_EMOJIS = ['👍', '❤️', '✅', '👀', '🎉'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export function isReactionEmoji(v: unknown): v is ReactionEmoji {
  return typeof v === 'string' && (REACTION_EMOJIS as readonly string[]).includes(v)
}

export type Reactions = Record<string, string[]>

/**
 * Toggle `name`'s reaction for `emoji`: add it if absent, remove it if present.
 * Pure — returns a new object; empty emoji buckets are dropped so a comment with
 * no reactions left has `{}`.
 */
export function toggleReactor(reactions: Reactions | undefined, emoji: string, name: string): Reactions {
  const next: Reactions = {}
  for (const [e, names] of Object.entries(reactions ?? {})) {
    if (names.length) next[e] = [...names]
  }
  const who = next[emoji] ?? []
  next[emoji] = who.includes(name) ? who.filter(n => n !== name) : [...who, name]
  if (next[emoji].length === 0) delete next[emoji]
  return next
}
