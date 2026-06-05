import type { PageServerLoad } from './$types'
import { getTasks, getQuotes } from '$lib/server/db'

export const load: PageServerLoad = async () => {
  const [tasks, quotes] = await Promise.all([getTasks(), getQuotes()])
  return { tasks, quotes }
}
