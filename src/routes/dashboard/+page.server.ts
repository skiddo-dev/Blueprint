import type { PageServerLoad } from './$types'
import { getTasks } from '$lib/server/db'

export const load: PageServerLoad = async () => {
  const tasks = await getTasks()
  return { tasks }
}
