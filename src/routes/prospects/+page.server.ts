import type { PageServerLoad, Actions } from './$types'
import { fail } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { getProspects, upsertProspects } from '$lib/server/db'
import { fetchProspects, hasLiveSource } from '$lib/server/prospects-source'
import { PROSPECT_CENTER, PROSPECT_DEFAULTS } from '$lib/constants'

export const load: PageServerLoad = async () => {
  const prospects = await getProspects()
  return {
    prospects,
    center: PROSPECT_CENTER,
    defaults: PROSPECT_DEFAULTS,
    live: hasLiveSource(), // false → results are mock (USE_MOCK_DATA=true)
  }
}

const clampInt = (v: FormDataEntryValue | null, def: number, lo: number, hi: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
}

export const actions: Actions = {
  // Pull a fresh batch from the live hybrid source (OSM + county GIS), or the
  // mock generator in demo mode, and upsert into Mongo. The route is admin-gated
  // in hooks.server.ts; we re-check here as defense in depth.
  refresh: async ({ request, locals }) => {
    const session = await locals.auth()
    const role = (session?.user as Record<string, unknown> | undefined)?.role
    if (role !== 'admin') return fail(403, { error: 'Admin only.' })

    const form = await request.formData()
    const radiusMiles = clampInt(form.get('radiusMiles'), PROSPECT_DEFAULTS.radiusMiles, 1, 50)
    let minSqft = clampInt(form.get('minSqft'), PROSPECT_DEFAULTS.minSqft, 0, 2_000_000)
    let maxSqft = clampInt(form.get('maxSqft'), PROSPECT_DEFAULTS.maxSqft, 0, 2_000_000)
    if (minSqft > maxSqft) [minSqft, maxSqft] = [maxSqft, minSqft]

    try {
      const pulled = await fetchProspects({
        lat: PROSPECT_CENTER.lat,
        lng: PROSPECT_CENTER.lng,
        radiusMiles,
        minSqft,
        maxSqft,
      })
      // Persist whenever a real Mongo is available (skip only in full mock mode,
      // where getProspects() regenerates fresh mock data on its own).
      const stats =
        env.USE_MOCK_DATA === 'true'
          ? { added: pulled.length, updated: 0 }
          : await upsertProspects(pulled)

      return {
        ok: true,
        live: hasLiveSource(),
        count: pulled.length,
        added: stats.added,
        updated: stats.updated,
      }
    } catch (e) {
      return fail(502, { error: e instanceof Error ? e.message : String(e) })
    }
  },
}
