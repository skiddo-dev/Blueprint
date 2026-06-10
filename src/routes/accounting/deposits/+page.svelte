<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  let picked = $state<Record<string, boolean>>({})
  let accountId = $state('1000')
  let date = $state(new Date().toISOString().slice(0, 10))
  let memo = $state('')
  let saving = $state(false)
  let errorMsg = $state('')

  const pickedIds = $derived(Object.keys(picked).filter((id) => picked[id]))
  const pickedTotal = $derived(data.undeposited.filter((p) => picked[p._id]).reduce((t, p) => t + p.amount, 0))

  async function deposit() {
    saving = true
    errorMsg = ''
    try {
      const r = await fetch('/api/accounting/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, date, payment_ids: pickedIds, memo: memo || undefined }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      picked = {}; memo = ''
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function voidDeposit(id: string) {
    if (!confirm('Void this deposit? The payments return to Undeposited Funds.')) return
    saving = true
    errorMsg = ''
    try {
      const r = await fetch(`/api/accounting/deposits/${id}/void`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Deposits · Blueprint</title></svelte:head>

<AccountingShell {user} title="Deposits" maxWidth="940px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Deposits' }]}>

  <p class="report-hint">Checks recorded to Undeposited Funds wait here; group the ones you took to the bank into one deposit so the register shows the single line your statement will. Payments straight to a bank account never appear here.</p>

  <section class="card flush">
    <div class="card-head pad"><h2>Undeposited payments</h2></div>
    {#if data.undeposited.length === 0}
      <p class="empty">Nothing waiting. Choose “Undeposited Funds” on the payment form when you're holding checks to batch.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Date</th><th>Customer</th><th>Invoice</th><th>Method</th><th class="num">Amount</th></tr>
          </thead>
          <tbody>
            {#each data.undeposited as p (p._id)}
              <tr>
                <td><input type="checkbox" bind:checked={picked[p._id]} aria-label="Include payment" /></td>
                <td class="mono">{p.date}</td>
                <td>{p.customer_name ?? '—'}</td>
                <td class="mono">{p.invoice_year && p.invoice_number ? `#${p.invoice_year}-${String(p.invoice_number).padStart(4, '0')}` : '—'}</td>
                <td>{p.method ?? '—'}</td>
                <td class="num">{usd(p.amount)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="deposit-bar">
        <span class="total">{pickedIds.length} selected · <strong>{usd(pickedTotal)}</strong></span>
        <label>Into
          <select bind:value={accountId}>
            {#each data.bankAccounts as a (a._id)}<option value={a._id}>{a._id} · {a.name}</option>{/each}
          </select>
        </label>
        <label>Date<input type="date" bind:value={date} /></label>
        <label class="grow">Memo<input type="text" bind:value={memo} placeholder="deposit slip #…" /></label>
        <button class="btn-primary" type="button" onclick={deposit} disabled={saving || pickedIds.length === 0}>
          {saving ? 'Working…' : `Record deposit`}
        </button>
      </div>
      {#if errorMsg}<p class="error pad-x">{errorMsg}</p>{/if}
    {/if}
  </section>

  <section class="card flush">
    <div class="card-head pad"><h2>Deposit history</h2></div>
    {#if data.deposits.length === 0}
      <p class="empty">No deposits recorded yet.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Into</th><th class="num">Payments</th><th class="num">Total</th><th>Memo</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {#each data.deposits as dep (dep._id)}
              <tr class:voided={dep.status === 'void'}>
                <td class="mono">{dep.date}</td>
                <td class="mono">{dep.account_id}</td>
                <td class="num">{dep.payment_ids.length}</td>
                <td class="num">{usd(dep.total)}</td>
                <td>{dep.memo ?? ''}</td>
                <td>{dep.status === 'void' ? '✕ void' : '✓ posted'}</td>
                <td class="num">
                  {#if dep.status === 'posted'}
                    <button class="btn-secondary danger" type="button" onclick={() => voidDeposit(dep._id)} disabled={saving}>Void</button>
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
  .card-head.pad { padding: 14px 16px 0; }
  .deposit-bar {
    display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;
    padding: 12px 16px; border-top: 1px solid var(--border-soft);
  }
  .deposit-bar .total { font-size: 13px; color: var(--text-body); margin-right: auto; align-self: center; }
  .deposit-bar label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .deposit-bar .grow { flex: 1; min-width: 140px; }
  .pad-x { padding: 0 16px 12px; }
  tr.voided { opacity: 0.55; }
  :global(.acct .btn-secondary.danger) { color: #dc2626; border-color: #fca5a5; }
</style>
