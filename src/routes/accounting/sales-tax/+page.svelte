<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  let amount = $state('')
  let date = $state(new Date().toISOString().slice(0, 10))
  let accountId = $state('1000')
  let memo = $state('')
  let saving = $state(false)
  let errorMsg = $state('')

  // Prefill with the open balance once data lands (the usual case: remit it all).
  $effect(() => { if (!amount && data.balance > 0) amount = (data.balance / 100).toFixed(2) })

  const overBalance = $derived.by(() => {
    const v = Number(amount.replace(/[$,]/g, ''))
    return Number.isFinite(v) && Math.round(v * 100) > data.balance
  })

  async function remit() {
    saving = true
    errorMsg = ''
    try {
      const r = await fetch('/api/accounting/sales-tax/remittances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date, account_id: accountId, memo: memo || undefined }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      amount = ''; memo = ''
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function voidRemittance(id: string) {
    if (!confirm('Void this remittance? Its journal entry reverses (dated today).')) return
    saving = true
    errorMsg = ''
    try {
      const r = await fetch(`/api/accounting/sales-tax/remittances/${id}/void`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Sales Tax · Blueprint</title></svelte:head>

<AccountingShell {user} title="Sales Tax" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Sales tax' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href="/api/accounting/export/sales-tax">⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">Tax collected on invoices sits in Sales Tax Payable until it's remitted to the state. Collected follows the invoice date; voided invoices net out in the month of the void.</p>

  <section class="card stat-row">
    <div>
      <span class="k">Currently owed</span>
      <span class="v">{usd(data.balance)}</span>
    </div>
    <a class="reg-link" href="/accounting/register/2200">View the 2200 register →</a>
  </section>

  <section class="card flush">
    {#if data.months.length === 0}
      <p class="empty">No sales-tax activity yet — it records as taxed invoices post.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Month</th><th class="num">Collected</th><th class="num">Credited back</th><th class="num">Remitted</th><th class="num">Net</th></tr>
          </thead>
          <tbody>
            {#each data.months as m (m.period)}
              <tr>
                <td class="mono">{m.period}</td>
                <td class="num">{usd(m.collected)}</td>
                <td class="num">{m.credited ? usd(m.credited) : ''}</td>
                <td class="num">{m.remitted ? usd(m.remitted) : ''}</td>
                <td class="num">{usd(m.net)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>Record a remittance</h2></div>
    <div class="pay-form">
      <label>Amount<input type="text" inputmode="decimal" bind:value={amount} placeholder="0.00" /></label>
      <label>Date<input type="date" bind:value={date} /></label>
      <label>Paid from
        <select bind:value={accountId}>
          {#each data.bankAccounts as a (a._id)}
            <option value={a._id}>{a._id} · {a.name}</option>
          {/each}
        </select>
      </label>
      <label class="grow">Memo<input type="text" bind:value={memo} placeholder="confirmation #, period covered…" /></label>
      <button class="btn-primary" type="button" onclick={remit} disabled={saving || !amount.trim()}>
        {saving ? 'Working…' : 'Record remittance'}
      </button>
    </div>
    {#if overBalance}
      <p class="warn">Heads up: this is more than the {usd(data.balance)} currently owed — fine if you're covering a timing difference, but double-check the amount.</p>
    {/if}
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
  </section>

  <section class="card flush">
    <div class="card-head pad"><h2>Remittance history</h2></div>
    {#if data.remittances.length === 0}
      <p class="empty">No remittances recorded yet.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th class="num">Amount</th><th>Paid from</th><th>Memo</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {#each data.remittances as r (r._id)}
              <tr class:voided={r.status === 'void'}>
                <td class="mono">{r.date}</td>
                <td class="num">{usd(r.amount)}</td>
                <td class="mono">{r.account_id}</td>
                <td>{r.memo ?? ''}</td>
                <td>{r.status === 'void' ? '✕ void' : '✓ posted'}</td>
                <td class="num">
                  {#if r.status === 'posted'}
                    <button class="btn-secondary danger" type="button" onclick={() => voidRemittance(r._id)} disabled={saving}>Void</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>

<style>
  .stat-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .stat-row .k { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }
  .stat-row .v { font-size: 26px; font-weight: 700; color: var(--text); }
  .reg-link { font-size: 13px; color: var(--text-muted); text-decoration: none; }
  .reg-link:hover { text-decoration: underline; }
  .pay-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .pay-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .pay-form .grow { flex: 1; min-width: 160px; }
  .warn { font-size: 13px; color: #b45309; margin: 10px 0 0; }
  .card-head.pad { padding: 14px 16px 0; }
  tr.voided { opacity: 0.55; }
  tr.voided td:not(:last-child) { text-decoration: line-through; }
  :global(.acct .btn-secondary.danger) { color: #dc2626; border-color: #fca5a5; }
</style>
