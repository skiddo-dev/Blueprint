<script lang="ts">
  import type { PageData } from './$types'
  import { STATUS_META, QUOTE_STATUSES, QUOTE_STATUS_META } from '$lib/constants'
  import type { Task, AppSession, Quote } from '$lib/types'
  import { extractStoreNumbers } from '$lib/storeNumbers'
  import { canonicalizeContact, canonicalizeWorkType } from '$lib/quoteCanonical'
  import Chart from '$lib/components/Chart.svelte'
  import NavDrawer from '$lib/components/NavDrawer.svelte'
  import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'

  let { data }: { data: PageData } = $props()
  const tasks: Task[] = data.tasks

  // Session comes from the root layout load; this route is admin-only.
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }

  let sidebarOpen = $state(false)

  // ── Quote tracker (win/loss toggle) ───────────────────────────────────────
  const filterOptions = ['open', 'won', 'lost', 'all'] as const
  let quoteFilter = $state<(typeof filterOptions)[number]>('open')
  let savingId = $state<string | null>(null)
  let trackerError = $state('')
  async function setQuoteStatus(id: string, status: string) {
    savingId = id
    trackerError = ''
    try {
      const r = await fetch(`/api/quotes/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error(await r.text())
      location.reload() // refresh charts + metrics from fresh data
    } catch (e) {
      trackerError = String(e)
      savingId = null
    }
  }

  // ── Palette & formatters ────────────────────────────────────────────────
  const PALETTE = [
    '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899',
    '#8b5cf6', '#14b8a6', '#ef4444', '#f97316', '#06b6d4',
  ]
  const palette = (n: number) => Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length])
  const TICK = '#94a3b8'
  const GRID = '#eef2f6'
  const WON = '#10b981'
  const LOST = '#ef4444'

  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const moneyShort = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `$${Math.round(n)}`

  const parseQuote = (q: unknown): number => {
    if (typeof q !== 'string') return 0
    const n = parseFloat(q.replace(/[$,]/g, ''))
    return isNaN(n) ? 0 : n
  }

  type Valued = Task & { quote_value: number }
  const withValues: Valued[] = tasks.map(t => ({ ...t, quote_value: parseQuote(t.quote) }))

  // Tracked quotes (the `quotes` collection) drive the value + win-rate analytics
  // below. Value-by-type also folds in task quotes. The raw-task table stays
  // task-only.
  const genQuotes: Quote[] = data.quotes ?? []
  type QuoteRec = { value: number; type: string; person: string; date?: string }
  const quoteRecs: QuoteRec[] = [
    ...withValues
      .filter(t => t.quote_value > 0)
      .map(t => ({
        value: t.quote_value,
        type: t.quote_type ?? 'Not Set',
        person: t.assigned_to || 'Unassigned',
        date: t.date,
      })),
    ...genQuotes.map(q => ({
      value: q.amount,
      type: canonicalizeWorkType(q.description) || 'Not Set',
      person: canonicalizeContact(q.point_of_contact) || 'Unassigned',
      date: q.date_sent,
    })),
  ]

  // Quote tracker rows (newest first), filtered by the chip selection.
  const quotesByDate = [...genQuotes].sort((a, b) => (b.date_sent ?? '').localeCompare(a.date_sent ?? ''))
  const shownQuotes = $derived(
    (quoteFilter === 'all' ? quotesByDate : quotesByDate.filter(q => (q.status ?? 'open') === quoteFilter)).slice(0, 200),
  )

  const sumInto = (map: Map<string, number>, key: string, val: number) =>
    map.set(key, (map.get(key) ?? 0) + val)

  // ── Win/loss helpers (over the tracked quote log) ─────────────────────────
  const winRateOf = (rs: Quote[]) => {
    const w = rs.filter(q => q.status === 'won').length
    const l = rs.filter(q => q.status === 'lost').length
    return { w, l, decided: w + l, rate: w + l ? w / (w + l) : 0 }
  }
  const groupQuotes = (key: (q: Quote) => string) => {
    const m = new Map<string, Quote[]>()
    for (const q of genQuotes) {
      const k = key(q) || 'Unknown'
      const arr = m.get(k)
      if (arr) arr.push(q); else m.set(k, [q])
    }
    return m
  }

  // ── Pipeline + headline metrics (task quotes by quote_status + tracked quotes
  //    by won/lost/open status; open → an undecided "Sent" quote). ───────────
  const quoted = withValues.filter(t => t.quote_value > 0)
  const valueByStage = new Map<string, number>()
  const countByStage = new Map<string, number>()
  for (const t of quoted) {
    const k = t.quote_status ?? 'Draft'
    sumInto(valueByStage, k, t.quote_value)
    sumInto(countByStage, k, 1)
  }
  const STATUS_TO_STAGE: Record<string, string> = { won: 'Won', lost: 'Lost', open: 'Sent' }
  for (const q of genQuotes) {
    const stage = STATUS_TO_STAGE[q.status ?? 'open'] ?? 'Sent'
    sumInto(valueByStage, stage, q.amount)
    sumInto(countByStage, stage, 1)
  }
  const wonCount = countByStage.get('Won') ?? 0
  const lostCount = countByStage.get('Lost') ?? 0
  const winRate = wonCount + lostCount > 0 ? wonCount / (wonCount + lostCount) : null
  const wonValue = valueByStage.get('Won') ?? 0
  const openPipeline = (valueByStage.get('Draft') ?? 0) + (valueByStage.get('Sent') ?? 0)
  const expectedValue = openPipeline * (winRate ?? 0)
  const totalValue = quoteRecs.reduce((s, r) => s + r.value, 0)
  const quoteCount = quoteRecs.length
  const pct = (n: number) => `${Math.round(n * 100)}%`

  const metrics = [
    { label: 'Win Rate', value: winRate === null ? '—' : pct(winRate), accent: WON },
    { label: 'Won Value', value: money(wonValue), accent: '#059669' },
    { label: 'Open Pipeline', value: money(openPipeline), accent: '#6366f1' },
    { label: 'Expected (open × win)', value: money(expectedValue), accent: '#8b5cf6' },
    { label: 'Total Quoted', value: money(totalValue), accent: '#3b82f6' },
    { label: 'Quotes', value: String(quoteCount), accent: '#ec4899' },
  ]

  // ── Insight aggregations ──────────────────────────────────────────────────
  // Win rate by estimator (≥5 decided) and by work type (≥4 decided)
  const estWin = [...groupQuotes(q => canonicalizeContact(q.point_of_contact)).entries()]
    .map(([name, rs]) => ({ name, ...winRateOf(rs) }))
    .filter(e => e.decided >= 5)
    .sort((a, b) => b.rate - a.rate)
  const typeWin = [...groupQuotes(q => canonicalizeWorkType(q.description)).entries()]
    .map(([name, rs]) => ({ name, ...winRateOf(rs) }))
    .filter(e => e.decided >= 4)
    .sort((a, b) => b.rate - a.rate)

  // Won / lost counts per deal-size band
  const sizeBands: Array<[string, number, number]> = [
    ['<$10k', 0, 10_000],
    ['$10–50k', 10_000, 50_000],
    ['$50–150k', 50_000, 150_000],
    ['$150–300k', 150_000, 300_000],
    ['$300k+', 300_000, Infinity],
  ]
  const inBand = (q: Quote, lo: number, hi: number) => Math.abs(q.amount) >= lo && Math.abs(q.amount) < hi
  const sizeWon = sizeBands.map(([, lo, hi]) => genQuotes.filter(q => q.status === 'won' && inBand(q, lo, hi)).length)
  const sizeLost = sizeBands.map(([, lo, hi]) => genQuotes.filter(q => q.status === 'lost' && inBand(q, lo, hi)).length)

  // Year over year: quoted vs won value + win rate
  const years = [...new Set(genQuotes.map(q => q.year).filter(Boolean))].sort()
  const yoyQuoted = years.map(y => genQuotes.filter(q => q.year === y).reduce((s, q) => s + q.amount, 0))
  const yoyWon = years.map(y => genQuotes.filter(q => q.year === y && q.status === 'won').reduce((s, q) => s + q.amount, 0))
  const yoyWinRate = years.map(y => {
    const r = winRateOf(genQuotes.filter(q => q.year === y))
    return r.decided ? Math.round(r.rate * 100) : null
  })

  // Top repeat stores by value
  const topStores = [...groupQuotes(q => (q.store_number || '').trim()).entries()]
    .filter(([s]) => s && s.toUpperCase() !== 'N/A' && s !== 'Unknown')
    .map(([store, rs]) => ({ store, value: rs.reduce((a, q) => a + q.amount, 0), n: rs.length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // Seasonality: quote count by month of year
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthCounts = Array(12).fill(0) as number[]
  for (const q of genQuotes) {
    const mo = q.date_sent ? Number(q.date_sent.slice(5, 7)) : NaN
    if (mo >= 1 && mo <= 12) monthCounts[mo - 1]++
  }

  // Median won vs lost (bigger deals are harder to win)
  const median = (xs: number[]) => {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const medianWon = median(genQuotes.filter(q => q.status === 'won').map(q => Math.abs(q.amount)))
  const medianLost = median(genQuotes.filter(q => q.status === 'lost').map(q => Math.abs(q.amount)))

  // Quote value by work type — merged (task quotes + tracked quotes)
  const valueByType = new Map<string, number>()
  for (const r of quoteRecs) sumInto(valueByType, r.type, r.value)
  const typeByValue = [...valueByType.entries()].sort((a, b) => b[1] - a[1])

  // ── Chart datasets ────────────────────────────────────────────────────────
  const bar = (data: number[], colors: string[]) =>
    [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false as const, maxBarThickness: 56 }]
  // Colour win-rate bars green/amber/red by how strong the rate is.
  const rateColors = (rates: number[]) =>
    rates.map(r => (r >= 0.66 ? WON : r >= 0.4 ? '#f59e0b' : LOST))

  const winByEstimatorData = {
    labels: estWin.map(e => `${e.name} (${e.w}-${e.l})`),
    datasets: [{ data: estWin.map(e => Math.round(e.rate * 100)), backgroundColor: rateColors(estWin.map(e => e.rate)), borderRadius: 5, maxBarThickness: 22 }],
  } satisfies ChartData<'bar', number[], string>

  const winByTypeData = {
    labels: typeWin.map(e => `${e.name} (${e.w}-${e.l})`),
    datasets: [{ data: typeWin.map(e => Math.round(e.rate * 100)), backgroundColor: rateColors(typeWin.map(e => e.rate)), borderRadius: 5, maxBarThickness: 22 }],
  } satisfies ChartData<'bar', number[], string>

  const dealSizeData = {
    labels: sizeBands.map(([l]) => l),
    datasets: [
      { label: 'Won', data: sizeWon, backgroundColor: WON, borderRadius: 4, maxBarThickness: 46 },
      { label: 'Lost', data: sizeLost, backgroundColor: LOST, borderRadius: 4, maxBarThickness: 46 },
    ],
  } satisfies ChartData<'bar', number[], string>

  const yoyData: ChartData<'bar' | 'line', (number | null)[], string> = {
    labels: years.map(String),
    datasets: [
      { type: 'bar', label: 'Quoted', data: yoyQuoted, backgroundColor: '#c7d2fe', borderRadius: 4, order: 3 },
      { type: 'bar', label: 'Won', data: yoyWon, backgroundColor: WON, borderRadius: 4, order: 2 },
      { type: 'line', label: 'Win %', data: yoyWinRate, borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1', tension: 0.3, borderWidth: 2, pointRadius: 3, spanGaps: true, order: 1 },
    ],
  }

  const topStoresData = {
    labels: topStores.map(s => `#${s.store} (×${s.n})`),
    datasets: bar(topStores.map(s => s.value), palette(topStores.length)),
  } satisfies ChartData<'bar', number[], string>

  const seasonalityData = {
    labels: MONTHS,
    datasets: bar(monthCounts, MONTHS.map(() => '#6366f1')),
  } satisfies ChartData<'bar', number[], string>

  const valueByTypeData = {
    labels: typeByValue.map(([k]) => k),
    datasets: bar(typeByValue.map(([, v]) => v), palette(typeByValue.length)),
  } satisfies ChartData<'bar', number[], string>

  const pipelineData = {
    labels: [...QUOTE_STATUSES],
    datasets: [{
      data: QUOTE_STATUSES.map(s => valueByStage.get(s) ?? 0),
      backgroundColor: QUOTE_STATUSES.map(s => QUOTE_STATUS_META[s].color),
      borderColor: '#fff',
      borderWidth: 2,
    }],
  } satisfies ChartData<'doughnut', number[], string>

  // ── Shared chart options ────────────────────────────────────────────────
  const moneyBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${money(c.parsed.y ?? 0)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) },
      },
    },
  } satisfies ChartOptions<'bar'>

  // Horizontal money bars (top stores).
  const hMoneyBarOpts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${money(c.parsed.x ?? 0)}` } },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) },
      },
      y: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
    },
  } satisfies ChartOptions<'bar'>

  // Horizontal win-rate (%) bars (estimator / work type).
  const winPctOpts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.parsed.x}% win rate` } },
    },
    scales: {
      x: {
        beginAtZero: true, max: 100,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => `${v}%` },
      },
      y: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
    },
  } satisfies ChartOptions<'bar'>

  // Grouped count bars with a legend (won vs lost by deal size; seasonality).
  const countBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.parsed.y} quote${c.parsed.y === 1 ? '' : 's'}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, precision: 0 } },
    },
  } satisfies ChartOptions<'bar'>

  const dealSizeOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.dataset.label}: ${c.parsed.y}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, precision: 0 } },
    },
  } satisfies ChartOptions<'bar'>

  // Dual-axis combo: quoted/won value bars (left) + win-rate line (right).
  const yoyOpts: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (c: TooltipItem<'bar' | 'line'>) =>
            c.dataset.label === 'Win %'
              ? ` Win rate: ${c.parsed.y}%`
              : ` ${c.dataset.label}: ${money(Number(c.parsed.y) || 0)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) } },
      y1: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: '#f59e0b', font: { size: 11 }, callback: v => `${v}%` } },
    },
  }

  const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 12 },
      },
      tooltip: { callbacks: { label: (c: TooltipItem<'doughnut'>) => ` ${c.label}: ${c.parsed}` } },
    },
  } satisfies ChartOptions<'doughnut'>

  // Like doughnutOpts but money-formatted tooltips (for value-by-stage).
  const moneyDoughnutOpts = {
    ...doughnutOpts,
    plugins: {
      ...doughnutOpts.plugins,
      tooltip: { callbacks: { label: (c: TooltipItem<'doughnut'>) => ` ${c.label}: ${money(c.parsed)}` } },
    },
  } satisfies ChartOptions<'doughnut'>
</script>

<svelte:head><title>Dashboard · Blueprint</title></svelte:head>

<div class="app-layout">
  <NavDrawer bind:open={sidebarOpen} {user} />

  <main class="main-content">
    <!-- Mobile top bar: shared `☰` opens the drawer. -->
    <div class="mobile-topbar">
      <button class="menu-btn" onclick={() => (sidebarOpen = true)} aria-label="Open menu">☰</button>
      <span class="topbar-title">📊 Dashboard</span>
    </div>

    <div class="page-head">
      <h1 class="page-title">📊 Dashboard</h1>
      <p class="page-sub">Quote insights from the RAVES quote log · Admin only</p>
      <hr style="margin: 12px 0 20px" />
    </div>

    {#if tasks.length === 0 && genQuotes.length === 0}
      <p class="empty">No tasks or generated quotes found yet.</p>
    {:else}
      <!-- Metrics -->
      <h2 class="section-heading">💰 Quote Summary</h2>
      <div class="metrics-grid">
        {#each metrics as m}
          <div class="metric" style:border-top-color={m.accent}>
            <div class="metric-val">{m.value}</div>
            <div class="metric-lbl">{m.label}</div>
          </div>
        {/each}
      </div>

      <hr style="margin: 22px 0 18px" />
      <h2 class="section-heading">📈 Insights</h2>

      <section class="charts-grid">
        <article class="chart-card">
          <h3>🏆 Win Rate by Estimator <span class="muted">(≥5 decided)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={winByEstimatorData} options={winPctOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🎯 Win Rate by Work Type <span class="muted">(≥4 decided)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={winByTypeData} options={winPctOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>📐 Won vs Lost by Deal Size</h3>
          <div class="canvas-wrap"><Chart type="bar" data={dealSizeData} options={dealSizeOpts} /></div>
          <p class="chart-note">Median won {money(medianWon)} · lost {money(medianLost)} — larger bids convert worse</p>
        </article>

        <article class="chart-card">
          <h3>💰 Quote Pipeline by Stage</h3>
          <div class="canvas-wrap"><Chart type="doughnut" data={pipelineData} options={moneyDoughnutOpts} /></div>
        </article>

        <article class="chart-card span-all">
          <h3>📈 Growth: Quoted vs Won by Year <span class="muted">(win-rate line)</span></h3>
          <div class="canvas-wrap tall"><Chart type="bar" data={yoyData} options={yoyOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🏬 Top Stores by Value <span class="muted">(repeat accounts)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={topStoresData} options={hMoneyBarOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🗓️ Quotes by Month <span class="muted">(seasonality)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={seasonalityData} options={countBarOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>💵 Total Quote Value by Type</h3>
          <div class="canvas-wrap"><Chart type="bar" data={valueByTypeData} options={moneyBarOpts} /></div>
        </article>
      </section>

      <!-- Quote tracker (win/loss toggle) -->
      <hr style="margin: 24px 0 16px" />
      <div class="tracker-head">
        <h2 class="section-heading" style="margin: 0">🧾 Quote Tracker</h2>
        <div class="filter-row">
          {#each filterOptions as f}
            <button class="chip" class:active={quoteFilter === f} onclick={() => (quoteFilter = f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          {/each}
        </div>
      </div>
      {#if trackerError}<p class="error">❌ {trackerError}</p>{/if}
      <p class="muted-note">
        Mark a quote Won/Lost to feed the win-rate. Showing {shownQuotes.length}
        {quoteFilter === 'all' ? '' : quoteFilter} quote{shownQuotes.length === 1 ? '' : 's'} (newest first, max 200).
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Store</th><th>Point of Contact</th><th>Work Type</th><th>Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {#each shownQuotes as q (q._id)}
              <tr>
                <td>{q.date_sent ?? '—'}</td>
                <td>{q.store_number || '—'}</td>
                <td>{q.point_of_contact || '—'}</td>
                <td>{q.description || '—'}</td>
                <td>{money(q.amount)}</td>
                <td>
                  <select
                    class="status-select status-{q.status ?? 'open'}"
                    value={q.status ?? 'open'}
                    disabled={savingId === q._id}
                    onchange={(e) => setQuoteStatus(q._id, e.currentTarget.value)}
                  >
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </td>
              </tr>
            {/each}
            {#if shownQuotes.length === 0}
              <tr><td colspan="6" class="muted-note">No {quoteFilter} quotes.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Raw table -->
      <hr style="margin: 24px 0 16px" />
      <h2 class="section-heading">📋 Raw Task Data</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Status</th><th>Assigned To</th>
              <th>Quote</th><th>Quote Type</th><th>Stores</th><th>Due Date</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {#each tasks as t}
              {@const stores = t.store_numbers ?? extractStoreNumbers(t.title)}
              <tr>
                <td class="title-cell">{t.title}</td>
                <td><span class="status-pill" style:background={STATUS_META[t.status]?.bg} style:color={STATUS_META[t.status]?.text}>{t.status}</span></td>
                <td>{t.assigned_to}</td>
                <td>{t.quote ?? '—'}</td>
                <td>{t.quote_type ?? '—'}</td>
                <td class="store-cell">
                  {#if stores.length}
                    {#each stores as s}<span class="store-mini">#{s}</span>{/each}
                  {:else}—{/if}
                </td>
                <td>{t.date ?? '—'}</td>
                <td>{t.created_at?.slice(0, 10) ?? '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <form action="/api/tasks/export" method="GET" style="margin-top: 12px">
        <button class="secondary" type="submit">📥 Download CSV</button>
      </form>
    {/if}
  </main>
</div>

<style>
  .app-layout { display: flex; height: 100vh; height: 100dvh; overflow: hidden; }
  hr { border: none; border-top: 1px solid #f1f5f9; }
  .main-content { flex: 1; overflow-y: auto; padding: 1.2rem 1.4rem; }
  /* Heading shows on desktop; on mobile the shared .mobile-topbar carries the title. */
  .page-head { display: block; }
  .page-title { font-size: 22px; font-weight: 800; color: #1e293b; }
  .page-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .section-heading { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
  .empty { color: #94a3b8; font-size: 14px; }

  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .metric {
    background: #fff; border: 1px solid #e8ecf1; border-top: 3px solid #6366f1;
    border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .metric-val { font-size: 20px; font-weight: 700; color: #1e293b; }
  .metric-lbl { font-size: 12px; color: #94a3b8; margin-top: 2px; }

  .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
  .chart-card {
    background: #fff; border: 1px solid #e8ecf1; border-radius: 12px; padding: 16px 16px 8px;
    box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .chart-card.span-all { grid-column: 1 / -1; }
  .chart-card h3 { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }
  .chart-card h3 .muted { color: #94a3b8; font-weight: 400; }
  .canvas-wrap { position: relative; height: 260px; }
  .canvas-wrap.tall { height: 300px; }
  .chart-note { font-size: 11px; color: #64748b; margin: 6px 2px 2px; }

  .tracker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
  .filter-row { display: flex; gap: 6px; }
  .chip { font-size: 12px; padding: 4px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; border-radius: 999px; cursor: pointer; }
  .chip.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
  .muted-note { font-size: 11px; color: #94a3b8; margin: 4px 2px 10px; }
  .error { color: #dc2626; font-size: 13px; margin: 6px 2px; }
  .status-select { font-size: 12px; padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; }
  .status-select.status-won { color: #047857; border-color: #a7f3d0; background: #ecfdf5; }
  .status-select.status-lost { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
  .status-select:disabled { opacity: 0.5; cursor: wait; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #374151; }
  tr:hover td { background: #fafafa; }
  .title-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-pill { border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
  .store-cell { white-space: nowrap; }
  .store-mini {
    display: inline-block;
    background: #1e3a8a; color: #fff;
    border-radius: 4px; padding: 1px 6px; margin-right: 3px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
  }

  @media (max-width: 768px) {
    /* The page title lives in the .mobile-topbar on small screens. */
    .page-head { display: none; }
    /* No top padding so the sticky .mobile-topbar pins flush to the top. */
    .main-content {
      padding-top: 0;
      padding-left: max(0.5rem, env(safe-area-inset-left));
      padding-right: max(0.5rem, env(safe-area-inset-right));
      padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
    }
  }
</style>
