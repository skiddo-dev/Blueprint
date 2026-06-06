import type { PageServerLoad } from './$types'
import { getTasks, getTasksForUser, getUsersByRole } from '$lib/server/db'

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  const role = user?.role as string | undefined
  const displayName = (user?.displayName as string) ?? (user?.name as string) ?? ''
  const email = (user?.email as string | undefined) ?? null

  const pmUsers = await getUsersByRole('pm')

  let tasks
  if (role === 'admin') {
    tasks = await getTasks()
  } else {
    tasks = await getTasksForUser(email, displayName)
  }

  return {
    tasks,
    pmUsers: pmUsers.map(u => ({ name: u.name, _id: u._id })),
  }
}
