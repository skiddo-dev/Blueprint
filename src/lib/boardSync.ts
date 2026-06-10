// Poll reconciliation — which cards changed REMOTELY between two board
// snapshots. Drives the brief highlight on cards another user just touched;
// pure so the attribution rules are testable away from the component.
import type { Task } from './types'

/** How long after a local write we still attribute a server-side change to
 *  ourselves (covers the write → poll round trip). */
export const LOCAL_EDIT_GRACE_MS = 5_000

/** Ids in `fresh` that are new or carry a different updated_at than `prev`,
 *  excluding cards this client wrote within the grace window (flashing your
 *  own edit back at you reads as a glitch, not a signal). */
export function remoteChangedIds(
  prev: readonly Task[],
  fresh: readonly Task[],
  localEdits: ReadonlyMap<string, number>,
  now: number,
): string[] {
  const prevById = new Map(prev.map(t => [t._id, t]))
  const cutoff = now - LOCAL_EDIT_GRACE_MS
  const out: string[] = []
  for (const t of fresh) {
    const p = prevById.get(t._id)
    if (p && p.updated_at === t.updated_at) continue
    const local = localEdits.get(t._id)
    if (local !== undefined && local > cutoff) continue
    out.push(t._id)
  }
  return out
}
