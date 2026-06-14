<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import StatTile from '$lib/components/accounting/StatTile.svelte'
  import { usd, usdCompact, pct } from '$lib/accounting/format'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'
  import { UNASSIGNED } from '$lib/jobs/cockpit'
  import type { PageData } from './$types'
  import type { AppSession, TaskStatus } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const rows = $derived(data.rows)
  const p = $derived(data.portfolio)

  const HEALTH_LABEL: Record<string, string> = { profit: 'Healthy', thin: 'Thin', loss: 'Losing', unbilled: 'Unbilled' }

  function ago(iso: string | null): string {
    if (!iso) return '—'
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days}d ago`
    return `${Math.floor(days / 30)}mo ago`
  }

  // Statuses present on a job's cards, in board order.
  const presentStatuses = (byStatus: Record<string, number>) =>
    KANBAN_STATUSES.filter((s) => (byStatus[s] ?? 0) > 0)
</script>

<svelte:head><title>Job Cockpit · Blueprint</title></svelte:head>

<PageShell {user} title="Job Cockpit" maxWidth="1180px">
  {#snippet head()}
    <h1>Job Cockpit</h1>
    <p class="lede">Every store, one screen — what it's worth (quotes), how the work's going (cards), and whether it's making money (books).</p>
  {/snippet}

  <!-- Portfolio KPIs -->
  <div class="kpis">
    <StatTile value={String(p.jobs)} label="Active jobs" accent="#6366f1" sub={`${p.openCards} open cards`} tone="muted" />
    <StatTile value={usd(p.contract)} label="Won contract value" accent="#10b981" sub="Across won quotes" tone="good" />
    <StatTile value={usd(p.pipeline)} label="Open pipeline" accent="#3b82f6" sub="Quotes still in play" tone="muted" />
    <StatTile value={usd(p.billed)} label="Billed to date" accent="#0ea5e9" sub={`${usd(p.cost)} in costs`} tone="muted" />
    <StatTile
      value={p.margin === null ? '—' : pct(p.margin, 1)} label="Portfolio margin"
      accent={p.margin !== null && p.margin >= 0 ? '#10b981' : '#ef4444'}
      sub={`${usd(p.profit)} profit`}
      tone={p.margin === null ? 'muted' : p.margin < 0 ? 'bad' : p.margin < 0.15 ? 'warn' : 'good'}
    />
  </div>

  {#if rows.length === 0}
    <p class="empty">No jobs yet — quotes, cards, and books docs tagged with a store number will roll up here.</p>
  {:else}
    <div class="jobs">
      {#each rows as r (r.store)}
        <section class="job" class:unassigned={r.store === UNASSIGNED}>
          <header class="job-head">
            <div class="store">
              {#if r.store === UNASSIGNED}
                <span class="store-no">Unassigned</span>
                <span class="store-sub">No store tag</span>
              {:else}
                <span class="store-no">Store {r.store}</span>
                <span class="store-sub">{r.quoteCount} quote{r.quoteCount === 1 ? '' : 's'} · {r.cards} card{r.cards === 1 ? '' : 's'}</span>
              {/if}
            </div>
            <span class="pill {r.health}" title={`${HEALTH_LABEL[r.health]} — margin ${r.margin === null ? 'n/a' : pct(r.margin, 1)}`}>
              {r.health === 'unbilled' ? 'Unbilled' : pct(r.margin ?? 0, 1)}
            </span>
          </header>

          <!-- Money: contract → billed → cost → profit -->
          <div class="money">
            <div class="m"><span class="m-label">Contract</span><span class="m-val">{usdCompact(r.contract)}</span></div>
            <div class="m"><span class="m-label">Billed</span><span class="m-val">{usdCompact(r.billed)}</span></div>
            <div class="m"><span class="m-label">Cost</span><span class="m-val">{usdCompact(r.cost)}</span></div>
            <div class="m"><span class="m-label">Profit</span><span class="m-val" class:loss={r.profit < 0}>{usdCompact(r.profit)}</span></div>
          </div>

          <!-- Billed against the won contract -->
          {#if r.billedPctOfContract !== null}
            <div class="bar" title={`Billed ${pct(r.billedPctOfContract, 0)} of contract`}>
              <div class="bar-fill" style:width={`${Math.min(100, r.billedPctOfContract * 100)}%`}></div>
            </div>
            <div class="bar-cap">Billed {pct(r.billedPctOfContract, 0)} of contract</div>
          {:else if r.contract > 0}
            <div class="bar-cap muted">Contract won · not billed yet</div>
          {/if}

          <!-- Ops: status mix + attachments + pipeline + last touch -->
          <footer class="ops">
            <div class="statuses">
              {#each presentStatuses(r.byStatus) as s (s)}
                {@const meta = STATUS_META[s as TaskStatus]}
                <span class="stat" style:background={meta.bg} style:color={meta.text} title={s}>
                  {meta.icon} {r.byStatus[s]}
                </span>
              {/each}
              {#if r.cards === 0}<span class="stat muted">no cards</span>{/if}
            </div>
            <div class="meta">
              {#if r.attachments > 0}<span class="meta-i"><Icon name="attachment" size={12} /> {r.attachments}</span>{/if}
              {#if r.pipeline > 0}<span class="meta-i" title="Open pipeline">+{usdCompact(r.pipeline)} open</span>{/if}
              <span class="meta-i" title="Last card activity"><Icon name="hourglass" size={12} /> {ago(r.lastActivity)}</span>
            </div>
          </footer>
        </section>
      {/each}
    </div>
  {/if}
</PageShell>

<style>
  h1 { font-size: var(--font-2xl); margin: 0 0 2px; color: var(--text); }
  .lede { color: var(--text-muted); margin: 0 0 18px; font-size: var(--font-sm); max-width: 60ch; }

  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .empty { color: var(--text-muted); padding: 2rem 0; text-align: center; }

  .jobs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 14px;
  }

  .job {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .job.unassigned { opacity: 0.85; }

  .job-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .store { display: flex; flex-direction: column; gap: 1px; }
  .store-no { font-weight: 700; font-size: var(--font-lg); color: var(--text); }
  .store-sub { font-size: var(--font-xs); color: var(--text-muted); }

  .pill {
    font-size: var(--font-xs); font-weight: 700; border-radius: var(--radius-lg);
    padding: 3px 10px; white-space: nowrap;
  }
  .pill.profit   { background: var(--success-bg); color: var(--success); }
  .pill.thin     { background: var(--warning-bg, #fffbeb); color: var(--warning, #b45309); }
  .pill.loss     { background: var(--danger-bg); color: var(--danger); }
  .pill.unbilled { background: var(--chip-bg); color: var(--text-muted); }

  .money {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
    padding: 10px 0;
  }
  .m { display: flex; flex-direction: column; gap: 2px; }
  .m-label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); }
  .m-val { font-weight: 600; font-size: var(--font-sm); color: var(--text); font-variant-numeric: tabular-nums; }
  .m-val.loss { color: var(--danger); }

  /* Neutral track (not --chip-bg, which is a saturated brand tint in dark mode
     and reads as a full bar against the --primary fill). */
  .bar { height: 6px; background: var(--border); border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--primary); border-radius: 999px; }
  .bar-cap { font-size: var(--font-xs); color: var(--text-muted); margin-top: -4px; }
  .bar-cap.muted { font-style: italic; }

  .ops { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: auto; }
  .statuses { display: flex; gap: 5px; flex-wrap: wrap; }
  .stat {
    font-size: var(--font-xs); font-weight: 600; border-radius: var(--radius-md);
    padding: 1px 7px; white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .stat.muted { background: var(--chip-bg); color: var(--text-muted); }
  .meta { display: flex; gap: 10px; align-items: center; }
  .meta-i { display: inline-flex; align-items: center; gap: 3px; font-size: var(--font-xs); color: var(--text-muted); white-space: nowrap; }
</style>
