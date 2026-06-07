import type { LayoutServerLoad } from './$types'
import { touchUserActivity } from '$lib/server/db'

export const load: LayoutServerLoad = async (event) => {
  const session = await event.locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  // Record last-active for provisioned users (throttled + best-effort; never
  // awaited so it can't slow the page). Powers the admin usage view.
  if (user?.email && user?.role) void touchUserActivity(user.email as string)
  return { session }
}
