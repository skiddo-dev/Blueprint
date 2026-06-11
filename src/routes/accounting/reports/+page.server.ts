import type { PageServerLoad } from './$types'
import { aiConfigured } from '$lib/server/booksAi'

// Admin-only (page guard in hooks.server.ts). The report list itself is
// static; `ai` gates the Ask-the-books box at the top.
export const load: PageServerLoad = async () => ({ ai: aiConfigured() })
