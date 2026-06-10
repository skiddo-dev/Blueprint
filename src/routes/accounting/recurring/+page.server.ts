import type { PageServerLoad } from './$types'
import { listTemplates } from '$lib/server/recurring'

// Admin-only (page guard in hooks.server.ts).
export const load: PageServerLoad = async () => ({ templates: await listTemplates() })
