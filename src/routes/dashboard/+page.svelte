<script lang="ts">
  import type { PageData } from './$types'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'
  import type { Task } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const tasks: Task[] = data.tasks

  function parseQuote(q: unknown): number {
    if (typeof q !== 'string') return 0
    const n = parseFloat(q.replace(/[$,]/g, ''))
    return isNaN(n) ? 0 : n
  }

  const withValues = tasks.map(t => ({ ...t, quote_value: parseQuote(t.quote) }))

  const totalValue = withValues.reduce((s, t) => s + t.quote_value, 0)
  const quoted = withValues.filter(t => t.quote_value > 0)
  const avgQuote = quoted.length ? totalValue / quoted.length : 0
  const maxQuote = Math.max(0, ...quoted.map(t => t.quote_value))
  const minQuote = quoted.length ? Math.min(...quoted.map(t => t.quote_value)) : 0

  // Count by status
  const statusCounts = Object.fromEntries(
    KANBAN_STATUSES.map(s => [s, tasks.filter(t => t.status === s).length])
  )

  // Quote value by type
  const byType: Record<string, number> = {}
  for (const t of withValues) {
    const k = t.quote_type ?? 'Not Set'
    byType[k] = (byType[k] ?? 0) + t.quote_value
  }

  // By assignee
  const byAssignee: Record<string, number> = {}
  for (const t of withValues) {
    const k = t.assigned_to ?? 'Unassigned'
    byAssignee[k] = (byAssignee[k] ?? 0) + t.quote_value
  }
  const topAssignees = Object.entries(byAssignee)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

  function fmt(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  }

  function barWidth(val: number, max: number) {
    return max > 0 ? `${(val / max) * 100}%` : '0%'
  }

  const maxByType = Math.max(0, ...Object.values(byType))
  const maxByAssignee = Math.max(0, ...topAssignees.map(([, v]) => v))
</script>

<svelte:head><title>Dashboard · Blueprint</title></svelte:head>

<div class="app-layout">
  <aside class="sidebar">
    <div class="user-info">
      <strong>Admin</strong>
      <span class="badge">Admin</span>
    </div>
    <form action="/auth/signout" method="POST">
      <button class="secondary full-w" type="submit">Log out</button>
    </form>
    <hr />
    <nav>
      <a href="/" class="nav-link">🏗️ Kanban Board</a>
      <a href="/quotes" class="nav-link">💰 Quote Generator</a>
    </nav>
  </aside>

  <main class="main-content">
    <h1 class="page-title">📊 Dashboard</h1>
    <p class="page-sub">Quote analytics & raw task data · Admin only</p>
    <hr style="margin: 12px 0 20px" />

    {#if tasks.length === 0}
      <p class="empty">No tasks found. Sync flagged emails from the Kanban board.</p>
    {:else}
      <!-- Metrics -->
      <h2 class="section-heading">💰 Quote Summary</h2>
      <div class="metrics-grid">
        <div class="metric"><div class="metric-val">{fmt(totalValue)}</div><div class="metric-lbl">Total Value</div></div>
        <div class="metric"><div class="metric-val">{fmt(avgQuote)}</div><div class="metric-lbl">Average Quote</div></div>
        <div class="metric"><div class="metric-val">{fmt(maxQuote)}</div><div class="metric-lbl">Highest Quote</div></div>
        <div class="metric"><div class="metric-val">{fmt(minQuote)}</div><div class="metric-lbl">Lowest Quote</div></div>
        <div class="metric"><div class="metric-val">{quoted.length}</div><div class="metric-lbl">Quoted Tasks</div></div>
      </div>

      <hr style="margin: 20px 0" />
      <h2 class="section-heading">📈 Analytics</h2>

      <div class="charts-grid">
        <!-- Quote value by type -->
        <div class="chart-card">
          <h3>💰 Total Quote Value by Type</h3>
          {#each Object.entries(byType).sort((a, b) => b[1] - a[1]) as [type, val]}
            <div class="bar-row">
              <span class="bar-label">{type}</span>
              <div class="bar-track">
                <div class="bar-fill" style:width={barWidth(val, maxByType)} style:background="#6366f1"></div>
              </div>
              <span class="bar-val">{fmt(val)}</span>
            </div>
          {/each}
        </div>

        <!-- Status distribution -->
        <div class="chart-card">
          <h3>🔵 Task Status Distribution</h3>
          {#each KANBAN_STATUSES as s}
            {@const m = STATUS_META[s]}
            {@const count = statusCounts[s] ?? 0}
            {@const maxCount = Math.max(1, ...Object.values(statusCounts))}
            <div class="bar-row">
              <span class="bar-label">{s}</span>
              <div class="bar-track">
                <div class="bar-fill" style:width={barWidth(count, maxCount)} style:background={m.color}></div>
              </div>
              <span class="bar-val">{count}</span>
            </div>
          {/each}
        </div>

        <!-- Top assignees -->
        <div class="chart-card">
          <h3>👥 Top 7 Assignees by Quote Value</h3>
          {#each topAssignees as [name, val]}
            <div class="bar-row">
              <span class="bar-label">{name}</span>
              <div class="bar-track">
                <div class="bar-fill" style:width={barWidth(val, maxByAssignee)} style:background="#f59e0b"></div>
              </div>
              <span class="bar-val">{fmt(val)}</span>
            </div>
          {/each}
        </div>
      </div>

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
  .app-layout { display: flex; height: 100vh; overflow: hidden; }
  .sidebar {
    width: 220px; background: #fff; border-right: 1px solid #e2e8f0;
    padding: 14px 12px; overflow-y: auto; flex-shrink: 0; display: flex;
    flex-direction: column; gap: 8px;
  }
  .user-info { font-size: 13px; color: #1e293b; display: flex; align-items: center; gap: 8px; }
  .badge { background: #e0e7ff; color: #4338ca; border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 600; }
  .full-w { width: 100%; }
  hr { border: none; border-top: 1px solid #f1f5f9; }
  nav { display: flex; flex-direction: column; gap: 4px; }
  .nav-link { display: block; padding: 8px 10px; font-size: 13px; font-weight: 500; color: #374151; text-decoration: none; border: 1px solid #e2e8f0; border-radius: 7px; background: #f8fafc; }
  .nav-link:hover { background: #eef2ff; color: #4338ca; }
  .main-content { flex: 1; overflow-y: auto; padding: 1.2rem 1.4rem; }
  .page-title { font-size: 22px; font-weight: 800; color: #1e293b; }
  .page-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .section-heading { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
  .empty { color: #94a3b8; font-size: 14px; }

  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .metric { background: #fff; border: 1px solid #e8ecf1; border-radius: 10px; padding: 14px 16px; }
  .metric-val { font-size: 20px; font-weight: 700; color: #6366f1; }
  .metric-lbl { font-size: 12px; color: #94a3b8; margin-top: 2px; }

  .charts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .chart-card { background: #fff; border: 1px solid #e8ecf1; border-radius: 10px; padding: 16px; }
  .chart-card h3 { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }

  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .bar-label { font-size: 11px; color: #64748b; width: 110px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; background: #f1f5f9; border-radius: 4px; height: 12px; }
  .bar-fill { height: 12px; border-radius: 4px; transition: width 0.4s ease; min-width: 2px; }
  .bar-val { font-size: 11px; color: #374151; font-weight: 600; width: 80px; text-align: right; flex-shrink: 0; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #374151; }
  tr:hover td { background: #fafafa; }
  .title-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-pill { border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
</style>
