import type { PageServerLoad } from './$types'
import { getQuotes, getTasks } from '$lib/server/db'
import { getJobDocs } from '$lib/server/jobs'
import { buildJobCockpit } from '$lib/jobs/cockpit'

// Admin-only (page guard in hooks.server.ts). The Job Cockpit joins the three
// things Blueprint already knows about a job — quotes (contract/pipeline),
// cards (field status), and books (billed/cost/margin) — keyed on store number.
// Archived cards are folded in so a finished job still shows its work history.
export const load: PageServerLoad = async () => {
  const [quotes, active, archived, books] = await Promise.all([
    getQuotes(),
    getTasks(),
    getTasks({ archived: true }),
    getJobDocs(),
  ])
  const { rows, portfolio } = buildJobCockpit({
    quotes,
    tasks: [...active, ...archived],
    books,
  })
  return { rows, portfolio }
}
