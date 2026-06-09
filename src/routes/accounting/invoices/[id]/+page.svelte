<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import StatusBadge from '$lib/components/accounting/StatusBadge.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const inv = $derived(data.invoice)
  const payments = $derived(data.payments)
  const num = $derived(`${inv.year}-${String(inv.number).padStart(4, '0')}`)
  const openForPayment = $derived(inv.status !== 'paid' && inv.status !== 'void' && inv.balance > 0)

  const today = new Date().toISOString().slice(0, 10)
  let payAmount = $state('')
  let payDate = $state(today)
  let payMethod = $state('')
  let saving = $state(false)
  let error = $state('')

  async function recordPayment() {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/invoices/${inv._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount, date: payDate, method: payMethod }),
      })
      if (!r.ok) throw new Error(await r.text())
      payAmount = ''
      payMethod = ''
      await invalidateAll() // refresh invoice balance/status + payment list
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Invoice {num} · Blueprint</title></svelte:head>

<AccountingShell {user} title="📄 Invoice {num}" maxWidth="820px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Invoices', href: '/accounting/invoices' }, { label: num }]}>
  {#snippet actions()}
    <StatusBadge status={inv.status} />
    <a class="btn-secondary" href="/api/accounting/invoices/{inv._id}/pdf" target="_blank" rel="noopener">⬇ PDF</a>
  {/snippet}

  <section class="card">
    <div class="facts">
      <div><span class="k">Customer</span><span>{inv.customer_name}</span></div>
      <div><span class="k">Issued</span><span class="mono">{inv.issue_date}</span></div>
      <div><span class="k">Due</span><span class="mono">{inv.due_date}</span></div>
      {#if inv.po}<div><span class="k">PO</span><span>{inv.po}</span></div>{/if}
    </div>

    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
      <tbody>
        {#each inv.lines as l, i (i)}
          <tr><td>{l.description}</td><td class="num">{l.quantity}</td><td class="num">{usd(l.unit_price)}</td><td class="num">{usd(l.amount)}</td></tr>
        {/each}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span class="num">{usd(inv.subtotal)}</span></div>
      {#if inv.tax > 0}<div><span>Tax ({inv.tax_rate}%)</span><span class="num">{usd(inv.tax)}</span></div>{/if}
      <div class="grand"><span>Total</span><span class="num">{usd(inv.total)}</span></div>
      <div><span>Paid</span><span class="num">{usd(inv.paid)}</span></div>
      <div class="bal"><span>Balance due</span><span class="num">{usd(inv.balance)}</span></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Payments</h2></div>
    {#if payments.length === 0}
      <p class="empty">No payments recorded.</p>
    {:else}
      <table>
        <thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead>
        <tbody>
          {#each payments as p (p._id)}
            <tr><td class="mono">{p.date}</td><td>{p.method ?? '—'}</td><td class="num">{usd(p.amount)}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if openForPayment}
      <div class="pay-form">
        <label>Amount<input type="text" inputmode="decimal" bind:value={payAmount} placeholder="0.00" /></label>
        <label>Date<input type="date" bind:value={payDate} /></label>
        <label class="grow">Method<input type="text" bind:value={payMethod} placeholder="check / ACH" /></label>
        <button class="btn-primary" type="button" onclick={recordPayment} disabled={saving || !payAmount.trim()}>
          {saving ? 'Recording…' : 'Record payment'}
        </button>
      </div>
      {#if error}<p class="error">{error}</p>{/if}
    {:else if inv.status === 'paid'}
      <p class="paid-note">✓ Paid in full.</p>
    {/if}
  </section>
</AccountingShell>

<style>
  /* Invoice-specific facts/totals/payment layout; shared chrome from accounting.css. */
  .facts { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-bottom: 16px; }
  .facts > div { display: flex; flex-direction: column; gap: 2px; }
  .facts .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }

  .totals { margin-top: 14px; margin-left: auto; max-width: 320px; }
  .totals > div { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; font-size: 13px; color: var(--text-body); }
  .totals .grand { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); margin-top: 4px; padding-top: 8px; }
  .totals .bal { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 4px; padding-top: 8px; }

  .pay-form { display: flex; gap: 10px; align-items: flex-end; margin-top: 14px; flex-wrap: wrap; }
  .pay-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .pay-form .grow { flex: 1; min-width: 140px; }
  .paid-note { color: #047857; font-weight: 600; font-size: 14px; margin-top: 12px; }
</style>
