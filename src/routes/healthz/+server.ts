import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// Liveness: the process is up and serving. No dependency checks here (use /readyz
// for those) so a liveness probe never restarts the app over a slow database.
export const GET: RequestHandler = async () => json({ status: 'ok' })
