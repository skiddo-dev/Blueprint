<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
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

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

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

<PageShell {user} title="📄 Invoice {num}" maxWidth="820px">
  {#snippet head()}
    <div class="head-row">
      <div>
        <h1>Invoice {num} <span class="badge {inv.status}">{inv.status}</span></h1>
        <p class="sub"><a href="/accounting/invoices">Invoices</a> · {inv.customer_name}</p>
      </div>
      <a class="btn-pdf" href="/api/accounting/invoices/{inv._id}/pdf" target="_blank" rel="noopener">⬇ PDF</a>
    </div>
    <hr style="margin: 14px 0 20px" />
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
    <h2>Payments</h2>
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
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; font-size: 22px; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }
  .btn-pdf {
    flex-shrink: 0; background: var(--bg); color: var(--text-body);
    border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px;
    font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap;
  }
  .btn-pdf:hover { border-color: var(--primary); color: var(--primary-text); }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; margin-bottom: 18px; }
  .card h2 { font-size: 15px; margin: 0 0 10px; }

  .facts { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-bottom: 16px; }
  .facts > div { display: flex; flex-direction: column; gap: 2px; }
  .facts .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

  .totals { margin-top: 14px; margin-left: auto; max-width: 320px; }
  .totals > div { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; font-size: 13px; color: var(--text-body); }
  .totals .grand { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); margin-top: 4px; padding-top: 8px; }
  .totals .bal { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 4px; padding-top: 8px; }

  .empty { color: var(--text-muted); font-size: 14px; }
  .pay-form { display: flex; gap: 10px; align-items: flex-end; margin-top: 14px; flex-wrap: wrap; }
  .pay-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .pay-form .grow { flex: 1; min-width: 140px; }
  .pay-form input { font: inherit; font-weight: 400; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); }
  .btn-primary { background: var(--primary); color: #fff; border: 1px solid var(--primary); border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { color: #dc2626; font-size: 13px; background: #fee2e2; border-radius: 8px; padding: 8px 12px; margin-top: 10px; }
  .paid-note { color: #047857; font-weight: 600; font-size: 14px; margin-top: 12px; }

  .badge { font-size: 12px; font-weight: 600; border-radius: 8px; padding: 2px 9px; text-transform: capitalize; vertical-align: middle; margin-left: 6px; }
  .badge.open { background: #dbeafe; color: #1d4ed8; }
  .badge.partial { background: #fef3c7; color: #b45309; }
  .badge.paid { background: #d1fae5; color: #047857; }
  .badge.void { background: #f1f5f9; color: #475569; }
</style>
