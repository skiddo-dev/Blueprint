<script lang="ts">
  import { onMount } from 'svelte'
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { toast } from '$lib/toast.svelte'
  import 'leaflet/dist/leaflet.css'
  import type { PageData, ActionData } from './$types'
  import type { Prospect, ProspectStatus, AppSession } from '$lib/types'
  import { PROSPECT_STATUSES, PROSPECT_STATUS_META, QUOTE_PEOPLE } from '$lib/constants'
  import {
    filterProspects, statusOf, sizeHistogram, byCity, byDecade, distanceBands, byStatus, toCSV,
    type ProspectFilters, type Bucket,
  } from '$lib/prospects'
  import PageShell from '$lib/components/PageShell.svelte'
  import Chart from '$lib/components/Chart.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import Skeleton from '$lib/components/Skeleton.svelte'
  import { trapFocus } from '$lib/actions/trapFocus'
  import { escapeHtml } from '$lib/sanitize'
  import type { ChartData, ChartOptions } from 'chart.js'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  // svelte-ignore state_referenced_locally
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }
  const ASSIGNEES = ['Unassigned', ...QUOTE_PEOPLE]

  // svelte-ignore state_referenced_locally
  const center = data.center

  // Local, mutable copy of the loaded prospects so inline edits update instantly;
  // re-synced from the server whenever a pull reloads the page data.
  // svelte-ignore state_referenced_locally
  let prospectList = $state<Prospect[]>(data.prospects ?? [])
  $effect(() => { prospectList = data.prospects ?? [] })

  // ── Pull form ──────────────────────────────────────────────────────────────
  // svelte-ignore state_referenced_locally
  let radiusMiles = $state(data.defaults.radiusMiles)
  // svelte-ignore state_referenced_locally
  let minSqft = $state(data.defaults.minSqft)
  // svelte-ignore state_referenced_locally
  let maxSqft = $state(data.defaults.maxSqft)
  let pulling = $state(false)
  const handlePull = () => {
    pulling = true
    return async ({ update }: { update: () => Promise<void> }) => {
      await update()
      pulling = false
    }
  }

  // ── Formatters ───────────────────────────────────────────────────────────
  const nf = new Intl.NumberFormat('en-US')
  const money = (n?: number) =>
    n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const sqft = (n?: number) => (n == null ? '—' : `${nf.format(n)} sf`)
  const miles = (n?: number) => (n == null ? '—' : `${n.toFixed(1)} mi`)

  // ── Filters ──────────────────────────────────────────────────────────────
  const boundsOf = (list: Prospect[]) => {
    const sf = list.map(p => p.building_sqft).filter((n): n is number => n != null)
    const ds = list.map(p => p.distance_miles).filter((n): n is number => n != null)
    const ys = list.map(p => p.year_built).filter((n): n is number => n != null)
    return {
      sqftMin: sf.length ? Math.min(...sf) : 0,
      sqftMax: sf.length ? Math.max(...sf) : 100_000,
      distMax: ds.length ? Math.ceil(Math.max(...ds)) : 50,
      yearMin: ys.length ? Math.min(...ys) : 1950,
      yearMax: ys.length ? Math.max(...ys) : new Date().getFullYear(),
    }
  }
  const bnd = $derived(boundsOf(prospectList))
  // svelte-ignore state_referenced_locally
  const b0 = boundsOf(data.prospects ?? [])

  let search = $state('')
  let fCity = $state('')
  let fStatus = $state<ProspectStatus | 'all'>('all')
  let fMinSqft = $state(b0.sqftMin)
  let fMaxSqft = $state(b0.sqftMax)
  let fMinYear = $state(b0.yearMin)
  let fMaxYear = $state(b0.yearMax)
  let fMaxDist = $state(b0.distMax)

  const cities = $derived([...new Set(prospectList.map(p => p.city).filter(Boolean))].sort() as string[])

  const filters = $derived<ProspectFilters>({
    search, city: fCity, status: fStatus,
    minSqft: Math.min(fMinSqft, fMaxSqft), maxSqft: Math.max(fMinSqft, fMaxSqft),
    maxDistance: fMaxDist, minYear: Math.min(fMinYear, fMaxYear), maxYear: Math.max(fMinYear, fMaxYear),
  })
  const filtered = $derived(filterProspects(prospectList, filters))

  const filtersActive = $derived(
    search !== '' || fCity !== '' || fStatus !== 'all' ||
    fMinSqft !== bnd.sqftMin || fMaxSqft !== bnd.sqftMax ||
    fMinYear !== bnd.yearMin || fMaxYear !== bnd.yearMax || fMaxDist !== bnd.distMax,
  )
  function resetFilters() {
    search = ''; fCity = ''; fStatus = 'all'
    fMinSqft = bnd.sqftMin; fMaxSqft = bnd.sqftMax
    fMinYear = bnd.yearMin; fMaxYear = bnd.yearMax; fMaxDist = bnd.distMax
  }

  // ── Summary (reactive to filters) ──────────────────────────────────────────
  const stats = $derived.by(() => {
    const sizes = filtered.map(p => p.building_sqft).filter((n): n is number => n != null)
    const dists = filtered.map(p => p.distance_miles).filter((n): n is number => n != null)
    return {
      count: filtered.length,
      avgSqft: sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
      closest: dists.length ? Math.min(...dists) : null,
      qualified: filtered.filter(p => statusOf(p) === 'qualified').length,
    }
  })

  // ── Charts (reactive to filters) ───────────────────────────────────────────
  const barData = (buckets: Bucket[], color: string): ChartData => ({
    labels: buckets.map(b => b.label),
    datasets: [{ data: buckets.map(b => b.count), backgroundColor: color, borderRadius: 4 }],
  })
  // No explicit tick/grid/label colors: they follow the themed Chart.js
  // defaults set by Chart.svelte (light/dark aware).
  const barOpts: ChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { font: { size: 10 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 }, grid: {} },
    },
  }
  const doughnutOpts: ChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } },
  }
  const sizeData = $derived(barData(sizeHistogram(filtered), '#6366f1'))
  const cityData = $derived(barData(byCity(filtered).slice(0, 8), '#3b82f6'))
  const decadeData = $derived(barData(byDecade(filtered), '#10b981'))
  const distData = $derived(barData(distanceBands(filtered), '#f59e0b'))
  const statusData = $derived.by((): ChartData => {
    const c = byStatus(filtered, PROSPECT_STATUSES)
    return {
      labels: PROSPECT_STATUSES.map(s => PROSPECT_STATUS_META[s].label),
      datasets: [{ data: PROSPECT_STATUSES.map(s => c[s]), backgroundColor: PROSPECT_STATUSES.map(s => PROSPECT_STATUS_META[s].color) }],
    }
  })

  // ── Sort ────────────────────────────────────────────────────────────────
  type SortKey = 'address' | 'city' | 'building_sqft' | 'year_built' | 'distance_miles' | 'owner'
  let sortKey = $state<SortKey>('distance_miles')
  let sortDir = $state<1 | -1>(1)
  const setSort = (k: SortKey) => {
    if (sortKey === k) sortDir = (sortDir * -1) as 1 | -1
    else { sortKey = k; sortDir = 1 }
  }
  const sorted = $derived.by(() => {
    const k = sortKey, dir = sortDir
    return [...filtered].sort((a, b) => {
      const av = a[k], bv = b[k]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  })
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? '▲' : '▼') : '')

  // ── Inline edits (PATCH + optimistic) ──────────────────────────────────────
  let saveError = $state('')
  async function patchProspect(id: string, patch: Partial<Pick<Prospect, 'pipeline_status' | 'assignee' | 'notes'>>) {
    prospectList = prospectList.map(p => (p._id === id ? { ...p, ...patch } : p))
    saveError = ''
    try {
      const r = await fetch(`/api/prospects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!r.ok) throw new Error(await r.text())
    } catch (e) {
      saveError = `Save failed: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  // ── Detail modal ───────────────────────────────────────────────────────────
  let modalId = $state<string | null>(null)
  const modal = $derived(modalId ? prospectList.find(p => p._id === modalId) ?? null : null)
  function openDetail(id: string) { modalId = id; focusMarker(id) }
  const gmaps = (p: Prospect) =>
    p.latitude != null && p.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`
  const countySearch = (p: Prospect) =>
    `https://www.google.com/search?q=${encodeURIComponent(`Oakland County MI parcel ${p.address}`)}`

  // Deep link from global search: /prospects?prospect=<id> opens that
  // prospect's detail modal. Waits for the list to populate (prospects can
  // arrive after a pull), and only handles each id once.
  let handledProspectId: string | null = null
  $effect(() => {
    const pid = page.url.searchParams.get('prospect')
    if (!pid || pid === handledProspectId || prospectList.length === 0) return
    handledProspectId = pid
    if (prospectList.some(p => p._id === pid)) openDetail(pid)
    else toast.error('That prospect couldn’t be found — it may have been removed.')
  })

  // ── Add to Kanban board ─────────────────────────────────────────────────────
  let addState = $state<'idle' | 'adding' | 'added' | 'error'>('idle')
  async function addToBoard(p: Prospect) {
    addState = 'adding'
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Prospect: ${p.address}`,
          description: `Warehouse lead — ${sqft(p.building_sqft)}${p.year_built ? `, built ${p.year_built}` : ''}.`,
          notes: [p.owner ? `Owner: ${p.owner}` : '', p.notes ?? ''].filter(Boolean).join('\n'),
          status: 'To Do',
          assigned_to: p.assignee || 'Unassigned',
          created_by: user.name,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      addState = 'added'
    } catch {
      addState = 'error'
    }
  }
  // Reset the add-to-board feedback whenever a different prospect's modal opens.
  $effect(() => { modalId; addState = 'idle' })

  // ── Map (Leaflet, client-only) ──────────────────────────────────────────────
  let mapEl = $state<HTMLDivElement>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map = $state<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let L = $state<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let markerLayer: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerById = new Map<string, any>()

  function focusMarker(id: string) {
    const m = markerById.get(id)
    if (map && m) { map.flyTo(m.getLatLng(), 13, { duration: 0.6 }); m.openPopup() }
  }

  onMount(() => {
    let destroyed = false
    ;(async () => {
      const mod = await import('leaflet')
      if (destroyed || !mapEl) return
      L = mod.default
      map = L.map(mapEl, { scrollWheelZoom: false }).setView([center.lat, center.lng], 10)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map)
      L.circle([center.lat, center.lng], {
        radius: radiusMiles * 1609.34, color: '#6366f1', weight: 1, fillColor: '#6366f1', fillOpacity: 0.05,
      }).addTo(map)
      L.circleMarker([center.lat, center.lng], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#1e293b', fillOpacity: 1,
      }).addTo(map).bindPopup(`<strong>${center.label}</strong><br>search center`)
      markerLayer = L.layerGroup().addTo(map)
    })()
    return () => { destroyed = true; if (map) { map.remove(); map = null } }
  })

  // Re-draw markers (status-colored) whenever the filtered list or map changes.
  $effect(() => {
    const list = filtered
    if (!map || !L || !markerLayer) return
    markerLayer.clearLayers()
    markerById.clear()
    const pts: [number, number][] = [[center.lat, center.lng]]
    for (const p of list) {
      if (p.latitude == null || p.longitude == null) continue
      pts.push([p.latitude, p.longitude])
      const color = PROSPECT_STATUS_META[statusOf(p)].color
      const m = L.circleMarker([p.latitude, p.longitude], {
        radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95,
      })
        .addTo(markerLayer)
        .bindPopup(
          `<strong>${escapeHtml(p.address)}</strong><br>${sqft(p.building_sqft)}` +
            `${p.year_built ? ` · built ${p.year_built}` : ''}` +
            `${p.owner ? `<br>${escapeHtml(p.owner)}` : ''}` +
            `${p.distance_miles != null ? `<br>${miles(p.distance_miles)} from center` : ''}`,
        )
      m.on('click', () => (modalId = p._id))
      markerById.set(p._id, m)
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 12 })
  })

  function downloadCSV() {
    const csv = toCSV(filtered)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<svelte:head><title>Prospects · Blueprint</title></svelte:head>

<PageShell {user} title="Prospects">
  {#snippet head()}
    <h1 class="page-title">Warehouse Prospects</h1>
    <p class="page-sub">
      Warehouse properties within {radiusMiles} mi of {center.label} · Admin only
      {#if !data.live}<span class="badge mock">Demo data — set USE_MOCK_DATA=false for live results</span>{/if}
    </p>
    <hr style="margin: 12px 0 18px" />
  {/snippet}

    <!-- Pull controls -->
    <form id="pull-form" method="POST" action="?/refresh" use:enhance={handlePull} class="pull-bar">
      <label>Radius (mi)<input type="number" name="radiusMiles" min="1" max="50" bind:value={radiusMiles} /></label>
      <label>Min size (sf)<input type="number" name="minSqft" min="0" step="1000" bind:value={minSqft} /></label>
      <label>Max size (sf)<input type="number" name="maxSqft" min="0" step="1000" bind:value={maxSqft} /></label>
      <button type="submit" class="primary" disabled={pulling}><Icon name="refresh" size={13} /> {pulling ? 'Pulling…' : 'Pull prospects'}</button>
      {#if form?.ok}
        <span class="result ok">Pulled {form.count} · {form.added} new, {form.updated} updated{form.live ? '' : ' (demo)'}</span>
      {:else if form?.error}
        <span class="result err">{form.error}</span>
      {/if}
    </form>

    {#if saveError}<p class="result err" style="margin:-8px 0 12px">{saveError}</p>{/if}

    {#if prospectList.length === 0}
      {#if pulling}
        <!-- Summary-card-shaped placeholders while the first pull runs. -->
        <div class="cards" aria-hidden="true">
          {#each { length: 4 } as _, i (i)}
            <div class="card"><Skeleton height="10px" width="56px" /><Skeleton height="22px" width="72px" /></div>
          {/each}
        </div>
      {:else}
        <div style="margin: 4vh 0 18px">
          <EmptyState icon="prospects" title="No prospects yet">
            Pull warehouses near {center.label} to start a list — size, owner, and distance come in automatically.
            {#snippet actions()}
              <button class="primary" type="submit" form="pull-form" disabled={pulling}>
                <Icon name="refresh" size={13} /> Pull prospects
              </button>
            {/snippet}
          </EmptyState>
        </div>
      {/if}
    {:else}
      <!-- Filters -->
      <div class="filter-bar">
        <input class="search" type="search" placeholder="Search address / owner / city…" bind:value={search} />
        <label class="fg">City
          <select bind:value={fCity}><option value="">All</option>{#each cities as c}<option value={c}>{c}</option>{/each}</select>
        </label>
        <label class="fg">Status
          <select bind:value={fStatus}>
            <option value="all">All</option>
            {#each PROSPECT_STATUSES as s}<option value={s}>{PROSPECT_STATUS_META[s].label}</option>{/each}
          </select>
        </label>
        <div class="fg range">
          <span>Size <strong>{sqft(Math.min(fMinSqft, fMaxSqft))} – {sqft(Math.max(fMinSqft, fMaxSqft))}</strong></span>
          <input type="range" min={bnd.sqftMin} max={bnd.sqftMax} step="500" bind:value={fMinSqft} aria-label="Min size" />
          <input type="range" min={bnd.sqftMin} max={bnd.sqftMax} step="500" bind:value={fMaxSqft} aria-label="Max size" />
        </div>
        <div class="fg range">
          <span>Built <strong>{Math.min(fMinYear, fMaxYear)} – {Math.max(fMinYear, fMaxYear)}</strong></span>
          <input type="range" min={bnd.yearMin} max={bnd.yearMax} step="1" bind:value={fMinYear} aria-label="Min year" />
          <input type="range" min={bnd.yearMin} max={bnd.yearMax} step="1" bind:value={fMaxYear} aria-label="Max year" />
        </div>
        <div class="fg range">
          <span>Within <strong>{fMaxDist} mi</strong></span>
          <input type="range" min="1" max={bnd.distMax} step="1" bind:value={fMaxDist} aria-label="Max distance" />
        </div>
        <div class="fg actions">
          <span class="count">{filtered.length} of {prospectList.length}</span>
          {#if filtersActive}<button class="chip" onclick={resetFilters}>Reset</button>{/if}
          <button class="chip" onclick={downloadCSV} disabled={filtered.length === 0}><Icon name="download" size={12} /> CSV</button>
        </div>
      </div>

      <!-- Summary -->
      <div class="cards">
        <div class="card"><span class="card-label">Showing</span><span class="card-value">{stats.count}</span></div>
        <div class="card"><span class="card-label">Avg size</span><span class="card-value">{sqft(stats.avgSqft)}</span></div>
        <div class="card"><span class="card-label">Closest</span><span class="card-value">{miles(stats.closest ?? undefined)}</span></div>
        <div class="card"><span class="card-label">Qualified</span><span class="card-value">{stats.qualified}</span></div>
      </div>

      <!-- Charts -->
      <div class="charts">
        <div class="chart-card"><span class="chart-title">Size distribution</span><div class="chart-box"><Chart type="bar" data={sizeData} options={barOpts} /></div></div>
        <div class="chart-card"><span class="chart-title">Top cities</span><div class="chart-box"><Chart type="bar" data={cityData} options={barOpts} /></div></div>
        <div class="chart-card"><span class="chart-title">Year built (by decade)</span><div class="chart-box"><Chart type="bar" data={decadeData} options={barOpts} /></div></div>
        <div class="chart-card"><span class="chart-title">Distance bands</span><div class="chart-box"><Chart type="bar" data={distData} options={barOpts} /></div></div>
        <div class="chart-card"><span class="chart-title">Pipeline</span><div class="chart-box"><Chart type="doughnut" data={statusData} options={doughnutOpts} /></div></div>
      </div>
    {/if}

    <!-- Map (always rendered; shows the search area even before a pull) -->
    <div class="map" bind:this={mapEl}></div>

    {#if filtered.length > 0}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th onclick={() => setSort('address')}>Address {arrow('address')}</th>
              <th onclick={() => setSort('city')}>City {arrow('city')}</th>
              <th class="num" onclick={() => setSort('building_sqft')}>Size {arrow('building_sqft')}</th>
              <th class="num" onclick={() => setSort('year_built')}>Built {arrow('year_built')}</th>
              <th onclick={() => setSort('owner')}>Owner {arrow('owner')}</th>
              <th>Status</th>
              <th>Assignee</th>
              <th class="num" onclick={() => setSort('distance_miles')}>Dist {arrow('distance_miles')}</th>
            </tr>
          </thead>
          <tbody>
            {#each sorted as p (p._id)}
              <tr class:active={modalId === p._id}>
                <td><button class="link" onclick={() => openDetail(p._id)}>{p.street ?? p.address}</button></td>
                <td>{p.city ?? '—'}{p.state ? `, ${p.state}` : ''}</td>
                <td class="num">{sqft(p.building_sqft)}</td>
                <td class="num">{p.year_built ?? '—'}</td>
                <td class="owner">{p.owner ?? '—'}</td>
                <td>
                  <select
                    class="status-select"
                    style:--c={PROSPECT_STATUS_META[statusOf(p)].color}
                    value={statusOf(p)}
                    onchange={(e) => patchProspect(p._id, { pipeline_status: e.currentTarget.value as ProspectStatus })}
                  >
                    {#each PROSPECT_STATUSES as s}<option value={s}>{PROSPECT_STATUS_META[s].label}</option>{/each}
                  </select>
                </td>
                <td>
                  <select
                    class="assignee-select"
                    value={p.assignee || 'Unassigned'}
                    onchange={(e) => patchProspect(p._id, { assignee: e.currentTarget.value === 'Unassigned' ? '' : e.currentTarget.value })}
                  >
                    {#each ASSIGNEES as a}<option value={a}>{a}</option>{/each}
                  </select>
                </td>
                <td class="num">{miles(p.distance_miles)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if prospectList.length > 0}
      <div style="margin-top: 14px">
        <EmptyState icon="sliders" title="No prospects match" size="sm">
          Every prospect is filtered out right now.
          {#snippet actions()}
            <button class="secondary" onclick={resetFilters}>Reset filters</button>
          {/snippet}
        </EmptyState>
      </div>
    {/if}
</PageShell>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && modalId) modalId = null }} />

<!-- Detail modal -->
{#if modal}
  {@const p = modal}
  <div class="modal-backdrop" onclick={() => (modalId = null)} role="presentation"></div>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Prospect details" use:trapFocus>
    <div class="modal-head">
      <div>
        <h2>{p.address}</h2>
        <span class="status-pill" style:background={PROSPECT_STATUS_META[statusOf(p)].bg} style:color={PROSPECT_STATUS_META[statusOf(p)].text}>
          {PROSPECT_STATUS_META[statusOf(p)].label}
        </span>
      </div>
      <button class="modal-close" onclick={() => (modalId = null)} aria-label="Close"><Icon name="x" size={15} /></button>
    </div>

    <div class="detail-grid">
      <div><span class="dl">Building</span>{sqft(p.building_sqft)}</div>
      <div><span class="dl">Lot</span>{p.lot_acres != null ? `${p.lot_acres} ac` : '—'}</div>
      <div><span class="dl">Year built</span>{p.year_built ?? '—'}</div>
      <div><span class="dl">Distance</span>{miles(p.distance_miles)}</div>
      <div><span class="dl">Owner</span>{p.owner ?? '—'}</div>
      <div><span class="dl">Use</span>{p.property_use ?? p.property_type ?? '—'}</div>
      <div><span class="dl">Assessed</span>{money(p.assessed_value)}</div>
      <div><span class="dl">Market</span>{money(p.market_value)}</div>
      <div><span class="dl">Last sale</span>{p.last_sale_amount ? `${money(p.last_sale_amount)}${p.last_sale_date ? ` (${p.last_sale_date})` : ''}` : '—'}</div>
    </div>

    <div class="modal-row">
      <label class="fg">Status
        <select value={statusOf(p)} onchange={(e) => patchProspect(p._id, { pipeline_status: e.currentTarget.value as ProspectStatus })}>
          {#each PROSPECT_STATUSES as s}<option value={s}>{PROSPECT_STATUS_META[s].label}</option>{/each}
        </select>
      </label>
      <label class="fg">Assignee
        <select value={p.assignee || 'Unassigned'} onchange={(e) => patchProspect(p._id, { assignee: e.currentTarget.value === 'Unassigned' ? '' : e.currentTarget.value })}>
          {#each ASSIGNEES as a}<option value={a}>{a}</option>{/each}
        </select>
      </label>
    </div>

    <label class="notes-label">Notes
      <textarea
        rows="3"
        placeholder="Contact log, next steps…"
        value={p.notes ?? ''}
        onchange={(e) => patchProspect(p._id, { notes: e.currentTarget.value })}
      ></textarea>
    </label>

    <div class="modal-actions">
      <a class="chip" href={gmaps(p)} target="_blank" rel="noopener"><Icon name="pin" size={12} /> Google Maps</a>
      <a class="chip" href={countySearch(p)} target="_blank" rel="noopener"><Icon name="archive" size={12} /> County records</a>
      <button class="primary" disabled={addState === 'adding' || addState === 'added'} onclick={() => addToBoard(p)}>
        {#if addState === 'added'}<Icon name="check" size={13} /> Added to board{:else if addState === 'adding'}Adding…{:else}<Icon name="plus" size={13} /> Add to Kanban board{/if}
      </button>
      {#if addState === 'error'}<span class="result err">Couldn’t add (needs MongoDB).</span>{/if}
    </div>
  </div>
{/if}

<style>
  .page-title { font-size: var(--font-2xl); font-weight: 800; color: var(--text); }
  .page-sub { font-size: var(--font-sm); color: var(--text-faint); margin-top: 2px; }

  .badge.mock {
    display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: var(--radius-lg);
    background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); font-weight: 600; font-size: var(--font-xs);
  }

  .pull-bar, .filter-bar {
    display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end;
    background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg);
    padding: 12px 16px; margin-bottom: 16px; box-shadow: var(--shadow);
  }
  .pull-bar label, .fg { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-xs); font-weight: 600; color: var(--text-muted); }
  .pull-bar input { width: 110px; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: var(--font-base); }
  .filter-bar .search { flex: 1 1 220px; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: var(--font-base); }
  .fg select { padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: var(--font-base); background: var(--card-bg); }
  .fg.range { min-width: 160px; }
  .fg.range span { color: var(--text-muted); }
  .fg.range strong { color: var(--text-body); }
  .fg.range input[type=range] { width: 160px; }
  .fg.actions { flex-direction: row; align-items: center; gap: 8px; margin-left: auto; }
  .count { font-size: var(--font-sm); color: var(--text-faint); font-weight: 600; }

  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; font-size: var(--font-sm); font-weight: 600; border: 1px solid var(--border);
    border-radius: var(--radius-md); background: var(--bg); color: var(--text-soft); cursor: pointer; text-decoration: none;
  }
  .chip:hover { background: var(--primary-bg); border-color: var(--primary); color: var(--primary-text); }
  .chip:disabled { opacity: 0.5; cursor: not-allowed; }

  /* `.primary` buttons use the global treatment (app.css). */
  .result { font-size: var(--font-sm); font-weight: 600; align-self: center; }
  .result.ok { color: var(--success); }
  .result.err { color: var(--danger); }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .card { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--shadow); }
  .card-label { font-size: var(--font-xs); font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: var(--font-2xl); font-weight: 800; color: var(--text); }

  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .chart-card { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 12px 14px; box-shadow: var(--shadow); }
  .chart-title { font-size: var(--font-sm); font-weight: 700; color: var(--text-soft); }
  .chart-box { height: 200px; position: relative; margin-top: 8px; }

  .map { height: 380px; border-radius: var(--radius-lg); border: 1px solid var(--border-card); margin-bottom: 16px; overflow: hidden; z-index: 0; }

  .table-wrap { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg); overflow: auto; box-shadow: var(--shadow); }
  table { width: 100%; border-collapse: collapse; font-size: var(--font-base); }
  th, td { padding: 8px 12px; text-align: left; white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--card-bg); color: var(--text-soft); font-weight: 700; font-size: var(--font-sm); cursor: pointer; user-select: none; border-bottom: 1px solid var(--border); }
  th:hover { color: var(--primary-text); }
  td { border-bottom: 1px solid var(--border-soft); color: var(--text-body); }
  tbody tr:hover { background: var(--bg); }
  tbody tr.active { background: var(--primary-bg); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .owner { max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
  .link { background: none; border: none; padding: 0; color: var(--primary-text); font: inherit; font-weight: 600; cursor: pointer; text-align: left; }
  .link:hover { text-decoration: underline; }
  .status-select { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 3px 6px; font-size: var(--font-sm); font-weight: 600; color: var(--c); background: var(--card-bg); }
  .assignee-select { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 3px 6px; font-size: var(--font-sm); color: var(--text-soft); background: var(--card-bg); }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: var(--backdrop); z-index: calc(var(--z-sheet) - 1); }
  .modal {
    position: fixed; z-index: var(--z-sheet); top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(560px, 94vw); max-height: 88vh; overflow-y: auto; background: var(--card-bg);
    border-radius: var(--radius-xl); padding: 18px 20px; box-shadow: var(--shadow-modal);
  }
  .modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .modal-head h2 { font-size: var(--font-xl); font-weight: 800; color: var(--text); margin: 0 0 6px; }
  .status-pill { display: inline-block; padding: 2px 10px; border-radius: var(--radius-lg); font-size: var(--font-xs); font-weight: 700; }
  .modal-close { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg); color: var(--text-muted); cursor: pointer; flex: 0 0 auto; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: var(--font-base); color: var(--text-body); margin-bottom: 14px; }
  .detail-grid .dl { display: block; font-size: var(--font-2xs); font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; }
  .modal-row { display: flex; gap: 16px; margin-bottom: 12px; }
  .notes-label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-xs); font-weight: 600; color: var(--text-muted); margin-bottom: 14px; }
  .notes-label textarea { padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-md); font: inherit; font-size: var(--font-base); resize: vertical; }
  .modal-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

  @media (max-width: 768px) {
    .fg.actions { margin-left: 0; }
    .detail-grid { grid-template-columns: 1fr; }
  }
</style>
