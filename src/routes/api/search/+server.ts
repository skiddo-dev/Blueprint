import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, getTasksForUser, getQuotes, getProspects } from '$lib/server/db'
import { searchTasks, searchQuotes, searchProspects, type SearchResults } from '$lib/search'

const EMPTY: SearchResults = { tasks: [], quotes: [], prospects: [] }
const MAX_QUERY = 100 // cap query length — autocomplete needs only a short prefix, not pasted blobs

// Global search. Role-scoped: admins search tasks + quotes + prospects; everyone
// else searches only their own tasks (quotes/prospects are admin-only data, so
// they'd never see them on a page either). Matching is in-memory (data is small).
export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)

  const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY)
  if (q.length < 2) return json(EMPTY)

  if (user.role === 'admin') {
    const [tasks, quotes, prospects] = await Promise.all([getTasks(), getQuotes(), getProspects()])
    return json({
      tasks: searchTasks(tasks, q),
      quotes: searchQuotes(quotes, q),
      prospects: searchProspects(prospects, q),
    } satisfies SearchResults)
  }

  const name = (user.displayName as string) ?? (user.name as string) ?? ''
  const email = (user.email as string | undefined) ?? null
  const tasks = await getTasksForUser(email, name)
  return json({ tasks: searchTasks(tasks, q), quotes: [], prospects: [] } satisfies SearchResults)
}
