import { getUsers } from './db'
import { SUPERVISORS } from '$lib/constants'

/**
 * The roster a comment's @mentions resolve against: provisioned users + the
 * static supervisor list. Degrades to SUPERVISORS only if the users lookup
 * fails (e.g. DB unreachable in a dev/mock session) so commenting still works.
 * Shared by the create + edit endpoints so mention resolution stays identical.
 */
export async function mentionCandidates(): Promise<string[]> {
  try {
    const users = await getUsers()
    return [...users.map(u => u.name).filter(Boolean), ...SUPERVISORS]
  } catch {
    return [...SUPERVISORS]
  }
}
