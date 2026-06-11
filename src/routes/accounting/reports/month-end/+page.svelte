<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  // svelte-ignore state_referenced_locally
  let month = $state(data.month)
  $effect(() => { month = data.month })

  // svelte-ignore state_referenced_locally
  let narrative = $state(data.narrative)
  // svelte-ignore state_referenced_locally
  let narrativeAt = $state(data.narrativeAt)
  $effect(() => { narrative = data.narrative; narrativeAt = data.narrativeAt })

  let generating = $state(false)
  let genError = $state('')

  function pickMonth(m: string) {
    if (/^\d{4}-\d{2}$/.test(m)) goto(`/accounting/reports/month-end?month=${m}`)
  }

  async function generate(force: boolean) {
    generating = true
    genError = ''
    try {
      const r = await fetch('/api/accounting/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: data.month, force }),
      })
      if (!r.ok) throw new Error(await r.text())
      const out = await r.json()
      narrative = out.narrative
      narrativeAt = out.generated_at
    } catch (e) {
      genError = e instanceof Error ? e.message : String(e)
    } finally {
      generating = false
    }
  }

  const refHref = (ref: { type: string; id: string }) =>
    ref.type === 'bill' ? `/accounting/bills/${ref.id}` : `/accounting/expenses/${ref.id}`
</script>

<svelte:head><title>Month-end review · Blueprint</title></svelte:head>

<AccountingShell {user} title="Month-end review" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: 'Month-end review' }]}>
  {#snippet actions()}
    <label class="field month-pick">Month
      <input type="month" bind:value={month} onchange={() => pickMonth(month)} />
    </label>
  {/snippet}

  <p class="report-hint">How {data.facts.label} actually went — the figures are computed straight from the ledger; the summary is written from those figures and nothing else. Run it before closing the period.</p>

  <section class="card">
    <div class="card-head">
      <h2>Plain-English summary</h2>
      <button class="btn-secondary" type="button" onclick={() => generate(!!narrative)} disabled={generating}
        title={data.ai ? 'Written from the figures below' : 'No OPENAI_API_KEY — a deterministic summary is used instead'}>
        <Icon name="spark" size={13} /> {generating ? 'Writing…' : narrative ? 'Regenerate' : 'Generate summary'}
      </button>
    </div>
    {#if narrative}
      <div class="narrative">{#each narrative.split('\n\n') as para (para)}<p>{para}</p>{/each}</div>
      {#if narrativeAt}<p class="gen-at">Generated {new Date(narrativeAt).toLocaleString()} — regenerate after new postings.</p>{/if}
    {:else}
      <p class="empty">No summary yet for {data.facts.label}. Generate one — or read the figures below, which don't need it.</p>
    {/if}
    {#if genError}<p class="error">{genError}</p>{/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>The figures — {data.facts.label}</h2></div>
    <div class="figures">
      {#each data.facts.figures as f (f.label)}
        <div class="fig">
          <span class="k">{f.label}</span>
          <span class="v">{f.value}</span>
          {#if f.note}<span class="n">{f.note}</span>{/if}
        </div>
      {/each}
    </div>
  </section>

  {#if data.facts.topExpenses.length}
    <section class="card">
      <div class="card-head"><h2>Largest cost accounts</h2></div>
      <table>
        <thead><tr><th>Account</th><th class="num">This month</th></tr></thead>
        <tbody>
          {#each data.facts.topExpenses as t (t.name)}
            <tr><td>{t.name}</td><td class="num">{t.amount}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section class="card">
    <div class="card-head"><h2>Review flags</h2><span class="muted">{data.anomalies.length || 'none'}</span></div>
    {#if data.anomalies.length === 0}
      <p class="empty">Nothing flagged for {data.facts.label} — no duplicate-looking bills or expenses, no unusual vendor amounts.</p>
    {:else}
      <p class="report-hint">Possible bookkeeping slips worth a look before the period closes. A flag is a question, not a verdict.</p>
      <ul class="flags">
        {#each data.anomalies as a, i (i)}
          <li class:warn={a.severity === 'warn'}>
            <Icon name="warning" size={14} />
            <span class="flag-body">
              {a.summary}
              <span class="flag-links">
                {#each a.refs as ref, j (ref.id)}
                  <a href={refHref(ref)}>open {a.refs.length > 1 ? `#${j + 1}` : ''}</a>
                {/each}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</AccountingShell>

<style>
  .month-pick { flex-direction: row; align-items: center; gap: 8px; font-weight: 600; }

  .narrative p { font-size: var(--font-md); color: var(--text-body); line-height: 1.6; margin: 0 0 10px; max-width: 70ch; }
  .gen-at { font-size: var(--font-sm); color: var(--text-muted); margin: 4px 0 0; }

  .figures { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .fig { background: var(--bg); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .fig .k { font-size: var(--font-xs); color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .fig .v { font-size: var(--font-lg); font-weight: 700; color: var(--text); }
  .fig .n { font-size: var(--font-sm); color: var(--text-muted); }

  .flags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .flags li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border-soft); border-radius: var(--radius-md); color: var(--text-body); font-size: var(--font-base); }
  .flags li.warn { border-color: var(--warning-border); background: var(--warning-bg); }
  .flags li :global(svg) { flex-shrink: 0; margin-top: 1px; color: var(--warning); }
  .flag-body { line-height: 1.5; }
  .flag-links { margin-left: 8px; display: inline-flex; gap: 8px; }
  .flag-links a { color: var(--primary-text); font-weight: 600; text-decoration: none; }
  .flag-links a:hover { text-decoration: underline; }
</style>
