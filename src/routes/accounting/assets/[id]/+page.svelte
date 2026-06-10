<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import ActivityFeed from '$lib/components/accounting/ActivityFeed.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const a = $derived(data.asset)

  let dispDate = $state(new Date().toISOString().slice(0, 10))
  let proceeds = $state('')
  let cashAccount = $state('1000')
  let saving = $state(false)
  let errorMsg = $state('')

  async function dispose() {
    if (!confirm(`Dispose "${a.name}"? Cost and accumulated depreciation clear; the difference posts to 4950 Gain/Loss.`)) return
    saving = true
    errorMsg = ''
    try {
      const r = await fetch(`/api/accounting/assets/${a._id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dispDate, proceeds, cash_account_id: cashAccount }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function undispose() {
    if (!confirm('Undo the disposal? Its journal entry reverses (dated today).')) return
    saving = true
    errorMsg = ''
    try {
      const r = await fetch(`/api/accounting/assets/${a._id}/dispose`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>{a.name} · Blueprint</title></svelte:head>

<AccountingShell {user} title={a.name} maxWidth="760px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Fixed assets', href: '/accounting/assets' }, { label: a.name }]}>
  {#snippet actions()}
    <span class="chip">{a.status}</span>
  {/snippet}

  <section class="card">
    <div class="facts">
      <div><span class="k">Acquired</span><span class="mono">{a.acquired_date}</span></div>
      <div><span class="k">In service</span><span class="mono">{a.in_service}</span></div>
      <div><span class="k">Cost</span><span>{usd(a.cost)}</span></div>
      <div><span class="k">Salvage</span><span>{usd(a.salvage)}</span></div>
      <div><span class="k">Life</span><span>{a.life_months} months</span></div>
      <div><span class="k">Accumulated</span><span>{usd(a.accumulated)}</span></div>
      <div><span class="k">Book value</span><span><strong>{usd(a.bookValue)}</strong></span></div>
    </div>
    {#if a.status === 'disposed' && a.disposal}
      <p class="disposed-note">Disposed {a.disposal.date} for {usd(a.disposal.proceeds)}.
        <button class="link" type="button" onclick={undispose} disabled={saving}>Undo disposal</button>
      </p>
    {/if}
  </section>

  <section class="card flush">
    <div class="card-head pad"><h2>Depreciation schedule</h2></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Month</th><th class="num">Amount</th><th class="num">Accumulated</th><th>Posted</th></tr></thead>
        <tbody>
          {#each a.schedule as r (r.period)}
            <tr class:posted={r.posted}>
              <td class="mono">{r.period}</td>
              <td class="num">{usd(r.amount)}</td>
              <td class="num">{usd(r.accumulated)}</td>
              <td>{r.posted ? '✓' : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  {#if a.status === 'active'}
    <section class="card">
      <div class="card-head"><h2>Dispose</h2></div>
      <div class="disp-form">
        <label>Date<input type="date" bind:value={dispDate} /></label>
        <label>Proceeds<input type="text" inputmode="decimal" bind:value={proceeds} placeholder="0.00" /></label>
        <label>Deposited to
          <select bind:value={cashAccount}>
            {#each data.bankAccounts as b (b._id)}<option value={b._id}>{b._id} · {b.name}</option>{/each}
          </select>
        </label>
        <button class="btn-secondary danger" type="button" onclick={dispose} disabled={saving}>
          {saving ? 'Working…' : 'Dispose asset'}
        </button>
      </div>
      {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    </section>
  {/if}

  <section class="card">
    <div class="card-head"><h2>Activity</h2></div>
    <ActivityFeed events={data.audit} />
  </section>
</AccountingShell>

<style>
  .facts { display: flex; flex-wrap: wrap; gap: 18px 28px; }
  .facts > div { display: flex; flex-direction: column; gap: 2px; }
  .facts .k { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }
  .card-head.pad { padding: 14px 16px 0; }
  tr.posted td { color: var(--text-muted); }
  .disposed-note { margin: 12px 0 0; font-size: var(--font-base); color: var(--warning); }
  .disp-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .disp-form label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: var(--text-body); }
  :global(.acct .btn-secondary.danger) { color: var(--danger); border-color: var(--danger-border); }
</style>
