<script lang="ts">
  import { onMount } from 'svelte'
  import { enhance } from '$app/forms'
  import 'leaflet/dist/leaflet.css'
  import type { PageData, ActionData } from './$types'
  import type { Prospect, AppSession } from '$lib/types'
  import NavDrawer from '$lib/components/NavDrawer.svelte'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  // Session comes from the root layout load; this route is admin-only (hooks).
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }

  let sidebarOpen = $state(false)

  const center = data.center
  const prospects = $derived<Prospect[]>(data.prospects ?? [])

  // ── Pull form ──────────────────────────────────────────────────────────────
  let radiusMiles = $state(data.defaults.radiusMiles)
  let minSqft = $state(data.defaults.minSqft)
  let maxSqft = $state(data.defaults.maxSqft)
  let pulling = $state(false)

  const handlePull = () => {
    pulling = true
    return async ({ update }: { update: () => Promise<void> }) => {
      await update() // apply action result + re-run load() → refreshed prospects
      pulling = false
    }
  }

  // ── Formatters ───────────────────────────────────────────────────────────
  const nf = new Intl.NumberFormat('en-US')
  const money = (n?: number) =>
    n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const sqft = (n?: number) => (n == null ? '—' : `${nf.format(n)} sf`)
  const miles = (n?: number) => (n == null ? '—' : `${n.toFixed(1)} mi`)

  // ── Summary stats ──────────────────────────────────────────────────────────
  const stats = $derived.by(() => {
    const list = prospects
    const sizes = list.map(p => p.building_sqft).filter((n): n is number => n != null)
    const dists = list.map(p => p.distance_miles).filter((n): n is number => n != null)
    const avg = sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0
    return {
      count: list.length,
      avgSqft: avg,
      closest: dists.length ? Math.min(...dists) : null,
      farthest: dists.length ? Math.max(...dists) : null,
    }
  })

  // ── Sortable table ─────────────────────────────────────────────────────────
  type SortKey = 'address' | 'city' | 'building_sqft' | 'year_built' | 'distance_miles' | 'owner' | 'market_value'
  let sortKey = $state<SortKey>('distance_miles')
  let sortDir = $state<1 | -1>(1)
  const setSort = (k: SortKey) => {
    if (sortKey === k) sortDir = (sortDir * -1) as 1 | -1
    else { sortKey = k; sortDir = 1 }
  }
  const sorted = $derived.by(() => {
    const k = sortKey, dir = sortDir
    return [...prospects].sort((a, b) => {
      const av = a[k], bv = b[k]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  })
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? '▲' : '▼') : '')

  // ── Map (Leaflet, client-only) ──────────────────────────────────────────────
  let mapEl = $state<HTMLDivElement>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map = $state<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let L = $state<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let markerLayer: any = null

  onMount(() => {
    let destroyed = false
    ;(async () => {
      const mod = await import('leaflet')
      if (destroyed || !mapEl) return
      L = mod.default
      map = L.map(mapEl, { scrollWheelZoom: false }).setView([center.lat, center.lng], 10)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)
      // Search center + radius ring.
      L.circle([center.lat, center.lng], {
        radius: radiusMiles * 1609.34,
        color: '#6366f1', weight: 1, fillColor: '#6366f1', fillOpacity: 0.05,
      }).addTo(map)
      L.circleMarker([center.lat, center.lng], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#1e293b', fillOpacity: 1,
      }).addTo(map).bindPopup(`<strong>${center.label}</strong><br>search center`)
      markerLayer = L.layerGroup().addTo(map)
    })()
    return () => {
      destroyed = true
      if (map) { map.remove(); map = null }
    }
  })

  // Re-draw prospect markers whenever the list (or map) changes.
  $effect(() => {
    const list = prospects
    if (!map || !L || !markerLayer) return
    markerLayer.clearLayers()
    const pts: [number, number][] = [[center.lat, center.lng]]
    for (const p of list) {
      if (p.latitude == null || p.longitude == null) continue
      pts.push([p.latitude, p.longitude])
      L.circleMarker([p.latitude, p.longitude], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#6366f1', fillOpacity: 0.95,
      })
        .addTo(markerLayer)
        .bindPopup(
          `<strong>${p.address}</strong><br>${sqft(p.building_sqft)}` +
            `${p.year_built ? ` · built ${p.year_built}` : ''}` +
            `${p.owner ? `<br>${p.owner}` : ''}` +
            `${p.distance_miles != null ? `<br>${miles(p.distance_miles)} from center` : ''}`,
        )
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 12 })
  })
</script>

<svelte:head><title>Prospects · Blueprint</title></svelte:head>

<div class="app-layout">
  <NavDrawer bind:open={sidebarOpen} {user} />

  <main class="main-content">
    <div class="mobile-topbar">
      <button class="menu-btn" onclick={() => (sidebarOpen = true)} aria-label="Open menu">☰</button>
      <span class="topbar-title">🏭 Prospects</span>
    </div>

    <div class="page-head">
      <h1 class="page-title">🏭 Warehouse Prospects</h1>
      <p class="page-sub">
        Warehouse properties within {radiusMiles} mi of {center.label} · Admin only
        {#if !data.live}<span class="badge mock">Demo data — set ATTOM_API_KEY for live results</span>{/if}
      </p>
      <hr style="margin: 12px 0 18px" />
    </div>

    <!-- Pull controls -->
    <form method="POST" action="?/refresh" use:enhance={handlePull} class="pull-bar">
      <label>Radius (mi)
        <input type="number" name="radiusMiles" min="1" max="50" bind:value={radiusMiles} />
      </label>
      <label>Min size (sf)
        <input type="number" name="minSqft" min="0" step="1000" bind:value={minSqft} />
      </label>
      <label>Max size (sf)
        <input type="number" name="maxSqft" min="0" step="1000" bind:value={maxSqft} />
      </label>
      <button type="submit" class="primary" disabled={pulling}>
        {pulling ? 'Pulling…' : '⟳ Pull prospects'}
      </button>
      {#if form?.ok}
        <span class="result ok">Pulled {form.count} · {form.added} new, {form.updated} updated{form.live ? '' : ' (demo)'}</span>
      {:else if form?.error}
        <span class="result err">{form.error}</span>
      {/if}
    </form>

    {#if prospects.length === 0}
      <p class="empty">No prospects yet. Click <strong>Pull prospects</strong> to fetch warehouses near {center.label}.</p>
    {:else}
      <!-- Summary -->
      <div class="cards">
        <div class="card"><span class="card-label">Prospects</span><span class="card-value">{stats.count}</span></div>
        <div class="card"><span class="card-label">Avg size</span><span class="card-value">{sqft(stats.avgSqft)}</span></div>
        <div class="card"><span class="card-label">Closest</span><span class="card-value">{miles(stats.closest ?? undefined)}</span></div>
        <div class="card"><span class="card-label">Farthest</span><span class="card-value">{miles(stats.farthest ?? undefined)}</span></div>
      </div>
    {/if}

    <!-- Map (always rendered; shows the search area even before a pull) -->
    <div class="map" bind:this={mapEl}></div>

    {#if prospects.length > 0}
      <!-- Table -->
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th onclick={() => setSort('address')}>Address {arrow('address')}</th>
              <th onclick={() => setSort('city')}>City {arrow('city')}</th>
              <th class="num" onclick={() => setSort('building_sqft')}>Size {arrow('building_sqft')}</th>
              <th class="num" onclick={() => setSort('year_built')}>Built {arrow('year_built')}</th>
              <th onclick={() => setSort('owner')}>Owner {arrow('owner')}</th>
              <th class="num" onclick={() => setSort('market_value')}>Market $ {arrow('market_value')}</th>
              <th class="num" onclick={() => setSort('distance_miles')}>Dist {arrow('distance_miles')}</th>
            </tr>
          </thead>
          <tbody>
            {#each sorted as p (p._id)}
              <tr>
                <td>{p.street ?? p.address}</td>
                <td>{p.city ?? '—'}{p.state ? `, ${p.state}` : ''}</td>
                <td class="num">{sqft(p.building_sqft)}</td>
                <td class="num">{p.year_built ?? '—'}</td>
                <td class="owner">{p.owner ?? '—'}</td>
                <td class="num">{money(p.market_value)}</td>
                <td class="num">{miles(p.distance_miles)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </main>
</div>

<style>
  .page-head { display: block; }
  .page-title { font-size: 22px; font-weight: 800; color: #1e293b; }
  .page-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .empty { color: #94a3b8; font-size: 14px; }

  .badge.mock {
    display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 10px;
    background: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-weight: 600; font-size: 11px;
  }

  .pull-bar {
    display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end;
    background: #fff; border: 1px solid #e8ecf1; border-radius: 10px;
    padding: 12px 16px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .pull-bar label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 600; color: #64748b; }
  .pull-bar input { width: 110px; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 13px; }
  .primary {
    background: #6366f1; color: #fff; border: none; border-radius: 8px;
    padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .primary:disabled { opacity: 0.6; cursor: progress; }
  .result { font-size: 12px; font-weight: 600; align-self: center; }
  .result.ok { color: #047857; }
  .result.err { color: #dc2626; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .card {
    background: #fff; border: 1px solid #e8ecf1; border-radius: 10px; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .card-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 20px; font-weight: 800; color: #1e293b; }

  .map { height: 380px; border-radius: 12px; border: 1px solid #e8ecf1; margin-bottom: 16px; overflow: hidden; z-index: 0; }

  .table-wrap { background: #fff; border: 1px solid #e8ecf1; border-radius: 12px; overflow: auto; box-shadow: 0 1px 4px rgba(15,23,42,0.05); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 9px 12px; text-align: left; white-space: nowrap; }
  th {
    position: sticky; top: 0; background: #f8fafc; color: #475569; font-weight: 700; font-size: 12px;
    cursor: pointer; user-select: none; border-bottom: 1px solid #e2e8f0;
  }
  th:hover { color: #4338ca; }
  td { border-bottom: 1px solid #f1f5f9; color: #334155; }
  tbody tr:hover { background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .owner { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
</style>
