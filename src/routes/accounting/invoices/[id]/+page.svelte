<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import StatusBadge from '$lib/components/accounting/StatusBadge.svelte'
  import ActivityFeed from '$lib/components/accounting/ActivityFeed.svelte'
  import AttachmentsPanel from '$lib/components/accounting/AttachmentsPanel.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const inv = $derived(data.invoice)
  const payments = $derived(data.payments)
  const credits = $derived(data.credits)
  const num = $derived(`${inv.year}-${String(inv.number).padStart(4, '0')}`)
  const openForPayment = $derived(inv.status !== 'paid' && inv.status !== 'void' && inv.balance > 0)
  const voidable = $derived(inv.status !== 'void' && inv.paid === 0 && (inv.credited ?? 0) === 0)

  // Payments and credit memos interleave chronologically in one settlement history.
  const history = $derived(
    [
      ...payments.map((p) => ({ kind: 'payment' as const, _id: p._id, date: p.date, label: p.method ?? '—', amount: p.amount })),
      ...credits.map((c) => ({ kind: 'credit' as const, _id: c._id, date: c.date, label: `Credit memo #${c.number}${c.memo ? ` — ${c.memo}` : ''}`, amount: c.amount })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1)),
  )

  const today = new Date().toISOString().slice(0, 10)
  let payAmount = $state('')
  let payDate = $state(today)
  let payMethod = $state('')
  let payDepositTo = $state('1000')
  let saving = $state(false)
  let error = $state('')

  let creditAmount = $state('')
  let creditDate = $state(today)
  let creditMemo = $state('')

  async function issueCredit() {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/invoices/${inv._id}/credit-memos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: creditAmount, date: creditDate, memo: creditMemo }),
      })
      if (!r.ok) throw new Error(await r.text())
      creditAmount = ''
      creditMemo = ''
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function voidInvoice() {
    if (!confirm(`Void invoice ${num}? This reverses its journal entry (dated today) and cannot be undone.`)) return
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/invoices/${inv._id}/void`, { method: 'POST' })
      if (!r.ok) throw new Error(await r.text())
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function recordPayment() {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/invoices/${inv._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount, date: payDate, method: payMethod, deposit_to: payDepositTo }),
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

<AccountingShell {user} title="Invoice {num}" maxWidth="820px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Invoices', href: '/accounting/invoices' }, { label: num }]}>
  {#snippet actions()}
    <StatusBadge status={inv.status} />
    {#if voidable}
      <button class="btn-secondary danger" type="button" onclick={voidInvoice} disabled={saving}>Void</button>
    {/if}
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
    <div class="card-head"><h2>Payments & credits</h2></div>
    {#if history.length === 0}
      <p class="empty">No payments or credits recorded.</p>
    {:else}
      <table>
        <thead><tr><th>Date</th><th>Detail</th><th class="num">Amount</th></tr></thead>
        <tbody>
          {#each history as h (h.kind + h._id)}
            <tr>
              <td class="mono">{h.date}</td>
              <td>{h.label} {#if h.kind === 'credit'}<span class="tag">credit</span>{/if}</td>
              <td class="num">{usd(h.amount)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if openForPayment}
      <div class="pay-form">
        <label>Amount<input type="text" inputmode="decimal" bind:value={payAmount} placeholder="0.00" /></label>
        <label>Date<input type="date" bind:value={payDate} /></label>
        <label>Method<input type="text" bind:value={payMethod} placeholder="check / ACH" /></label>
        <label class="grow">Deposit to
          <select bind:value={payDepositTo}>
            {#each data.depositTargets as t (t._id)}
              <option value={t._id}>{t._id} · {t.name}</option>
            {/each}
          </select>
        </label>
        <button class="btn-primary" type="button" onclick={recordPayment} disabled={saving || !payAmount.trim()}>
          {saving ? 'Recording…' : 'Record payment'}
        </button>
      </div>
      <details class="credit-box">
        <summary>Issue a credit memo…</summary>
        <p class="credit-hint">Reduces what the customer owes without recording cash — posts contra-revenue and credits A/R. For voiding an entire unpaid invoice, use Void instead.</p>
        <div class="pay-form">
          <label>Amount<input type="text" inputmode="decimal" bind:value={creditAmount} placeholder="0.00" /></label>
          <label>Date<input type="date" bind:value={creditDate} /></label>
          <label class="grow">Reason<input type="text" bind:value={creditMemo} placeholder="why the credit?" /></label>
          <button class="btn-secondary" type="button" onclick={issueCredit} disabled={saving || !creditAmount.trim()}>
            {saving ? 'Working…' : 'Apply credit'}
          </button>
        </div>
      </details>
      {#if error}<p class="error">{error}</p>{/if}
    {:else if inv.status === 'paid'}
      <p class="paid-note">✓ Settled in full{(inv.credited ?? 0) > 0 ? ' (includes credits)' : ''}.</p>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>Files</h2></div>
    <AttachmentsPanel ownerType="invoice" ownerId={inv._id} attachments={data.attachments} />
  </section>

  <section class="card">
    <div class="card-head"><h2>Activity</h2></div>
    <ActivityFeed events={data.audit} />
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
  .paid-note { color: var(--success); font-weight: 600; font-size: 14px; margin-top: 12px; }
  :global(.acct .btn-secondary.danger) { color: var(--danger); border-color: var(--danger-border); }
  :global(.acct .btn-secondary.danger:hover:not(:disabled)) { background: var(--danger-bg-subtle); border-color: var(--danger); }
  .credit-box { margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 10px; }
  .credit-box summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .credit-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 4px; max-width: 60ch; }
</style>
