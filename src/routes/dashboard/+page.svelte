<script lang="ts">
  import type { PageData } from './$types'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'
  import type { Task, AppSession } from '$lib/types'
  import Chart from '$lib/components/Chart.svelte'
  import NavDrawer from '$lib/components/NavDrawer.svelte'
  import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'

  let { data }: { data: PageData } = $props()
  const tasks: Task[] = data.tasks

  // Session comes from the root layout load; this route is admin-only.
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }

  let sidebarOpen = $state(false)

  // ── Palette & formatters ────────────────────────────────────────────────
  const PALETTE = [
    '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899',
    '#8b5cf6', '#14b8a6', '#ef4444', '#f97316', '#06b6d4',
  ]
  const palette = (n: number) => Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length])
  const fade = (hex: string, a = 0.15) => hex + Math.round(a * 255).toString(16).padStart(2, '0')
  const TICK = '#94a3b8'
  const GRID = '#eef2f6'

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

  // ── Summary metrics ─────────────────────────────────────────────────────
  const totalValue = withValues.reduce((s, t) => s + t.quote_value, 0)
  const quoted = withValues.filter(t => t.quote_value > 0)
  const avgQuote = quoted.length ? totalValue / quoted.length : 0
  const maxQuote = quoted.length ? Math.max(...quoted.map(t => t.quote_value)) : 0
  const minQuote = quoted.length ? Math.min(...quoted.map(t => t.quote_value)) : 0

  const metrics = [
    { label: 'Total Value', value: money(totalValue), accent: '#6366f1' },
    { label: 'Average Quote', value: money(avgQuote), accent: '#10b981' },
    { label: 'Highest Quote', value: money(maxQuote), accent: '#f59e0b' },
    { label: 'Lowest Quote', value: money(minQuote), accent: '#3b82f6' },
    { label: 'Quoted Tasks', value: String(quoted.length), accent: '#ec4899' },
  ]

  // ── Aggregations ────────────────────────────────────────────────────────
  const sumInto = (map: Map<string, number>, key: string, val: number) =>
    map.set(key, (map.get(key) ?? 0) + val)

  // Quote value by type / count by type
  const valueByType = new Map<string, number>()
  const countByType = new Map<string, number>()
  for (const t of withValues) {
    const k = t.quote_type ?? 'Not Set'
    sumInto(valueByType, k, t.quote_value)
    sumInto(countByType, k, 1)
  }
  const typeByValue = [...valueByType.entries()].sort((a, b) => b[1] - a[1])
  const typeByCount = [...countByType.entries()].sort((a, b) => b[1] - a[1])

  // Status distribution + average quote per status
  const statusCounts = KANBAN_STATUSES.map(s => tasks.filter(t => t.status === s).length)
  const avgByStatus = KANBAN_STATUSES.map(s => {
    const v = withValues.filter(t => t.status === s).map(t => t.quote_value)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  })

  // Top assignees by quote value
  const valueByAssignee = new Map<string, number>()
  for (const t of withValues) sumInto(valueByAssignee, t.assigned_to ?? 'Unassigned', t.quote_value)
  const topAssignees = [...valueByAssignee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)

  // Quote value distribution (histogram bins)
  const binDefs: Array<[string, number, number]> = [
    ['$0–1K', 0, 1000],
    ['$1–5K', 1000, 5000],
    ['$5–10K', 5000, 10_000],
    ['$10–25K', 10_000, 25_000],
    ['$25–50K', 25_000, 50_000],
    ['$50K+', 50_000, Infinity],
  ]
  const binCounts = binDefs.map(
    ([, lo, hi]) => withValues.filter(t => t.quote_value > lo && t.quote_value <= hi).length,
  )

  // Monthly quote-value trend, one line per top-4 quote type
  const monthKey = (s?: string): string | null => {
    if (!s) return null
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const monthsSet = new Set<string>()
  const trendAgg = new Map<string, number>() // `${month}|${type}` -> value
  for (const t of withValues) {
    const m = monthKey(t.date)
    if (!m) continue
    monthsSet.add(m)
    sumInto(trendAgg, `${m}|${t.quote_type ?? 'Not Set'}`, t.quote_value)
  }
  const months = [...monthsSet].sort()
  const trendTypes = typeByValue.slice(0, 4).map(([k]) => k)
  const prettyMonth = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
  }

  // ── Chart datasets ──────────────────────────────────────────────────────
  const bar = (data: number[], colors: string[]) =>
    [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false as const, maxBarThickness: 56 }]

  const valueByTypeData = {
    labels: typeByValue.map(([k]) => k),
    datasets: bar(typeByValue.map(([, v]) => v), palette(typeByValue.length)),
  } satisfies ChartData<'bar', number[], string>

  const binsData = {
    labels: binDefs.map(([l]) => l),
    datasets: bar(binCounts, palette(binDefs.length)),
  } satisfies ChartData<'bar', number[], string>

  const assigneeData = {
    labels: topAssignees.map(([k]) => k),
    datasets: bar(topAssignees.map(([, v]) => v), palette(topAssignees.length)),
  } satisfies ChartData<'bar', number[], string>

  const avgStatusData = {
    labels: [...KANBAN_STATUSES],
    datasets: bar(avgByStatus, KANBAN_STATUSES.map(s => STATUS_META[s].color)),
  } satisfies ChartData<'bar', number[], string>

  const statusData = {
    labels: [...KANBAN_STATUSES],
    datasets: [{
      data: statusCounts,
      backgroundColor: KANBAN_STATUSES.map(s => STATUS_META[s].color),
      borderColor: '#fff',
      borderWidth: 2,
    }],
  } satisfies ChartData<'doughnut', number[], string>

  const typeMixData = {
    labels: typeByCount.map(([k]) => k),
    datasets: [{
      data: typeByCount.map(([, v]) => v),
      backgroundColor: palette(typeByCount.length),
      borderColor: '#fff',
      borderWidth: 2,
    }],
  } satisfies ChartData<'doughnut', number[], string>

  const trendData = {
    labels: months.map(prettyMonth),
    datasets: trendTypes.map((ty, i) => ({
      label: ty,
      data: months.map(m => trendAgg.get(`${m}|${ty}`) ?? 0),
      borderColor: PALETTE[i],
      backgroundColor: fade(PALETTE[i], 0.12),
      fill: true,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
    })),
  } satisfies ChartData<'line', number[], string>

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

  const countBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.parsed.y} task${c.parsed.y === 1 ? '' : 's'}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, precision: 0 },
      },
    },
  } satisfies ChartOptions<'bar'>

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

  const lineOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 },
      },
      tooltip: {
        callbacks: { label: (c: TooltipItem<'line'>) => ` ${c.dataset.label}: ${money(c.parsed.y ?? 0)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) },
      },
    },
  } satisfies ChartOptions<'line'>
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
      <p class="page-sub">Quote analytics &amp; raw task data · Admin only</p>
      <hr style="margin: 12px 0 20px" />
    </div>

    {#if tasks.length === 0}
      <p class="empty">No tasks found. Sync flagged emails from the Kanban board.</p>
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
      <h2 class="section-heading">📈 Analytics</h2>

      <section class="charts-grid">
        <article class="chart-card">
          <h3>💰 Total Quote Value by Type</h3>
          <div class="canvas-wrap"><Chart type="bar" data={valueByTypeData} options={moneyBarOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🔵 Task Status Distribution</h3>
          <div class="canvas-wrap"><Chart type="doughnut" data={statusData} options={doughnutOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>📊 Task Mix by Quote Type</h3>
          <div class="canvas-wrap"><Chart type="doughnut" data={typeMixData} options={doughnutOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>📦 Quote Value Distribution</h3>
          <div class="canvas-wrap"><Chart type="bar" data={binsData} options={countBarOpts} /></div>
        </article>

        <article class="chart-card span-all">
          <h3>📈 Quote Value Trend Over Time (top types)</h3>
          <div class="canvas-wrap tall"><Chart type="line" data={trendData} options={lineOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>👥 Top 7 Assignees by Quote Value</h3>
          <div class="canvas-wrap"><Chart type="bar" data={assigneeData} options={hMoneyBarOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>📐 Average Quote by Status</h3>
          <div class="canvas-wrap"><Chart type="bar" data={avgStatusData} options={moneyBarOpts} /></div>
        </article>
      </section>

      <!-- Raw table -->
      <hr style="margin: 24px 0 16px" />
      <h2 class="section-heading">📋 Raw Task Data</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Status</th><th>Assigned To</th>
              <th>Quote</th><th>Quote Type</th><th>Due Date</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {#each tasks as t}
              <tr>
                <td class="title-cell">{t.title}</td>
                <td><span class="status-pill" style:background={STATUS_META[t.status]?.bg} style:color={STATUS_META[t.status]?.text}>{t.status}</span></td>
                <td>{t.assigned_to}</td>
                <td>{t.quote ?? '—'}</td>
                <td>{t.quote_type ?? '—'}</td>
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
  .canvas-wrap { position: relative; height: 260px; }
  .canvas-wrap.tall { height: 300px; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #374151; }
  tr:hover td { background: #fafafa; }
  .title-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-pill { border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; }

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
