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
  const bill = $derived(data.bill)
  const payments = $derived(data.payments)
  const credits = $derived(data.credits)
  const num = $derived(`${bill.year}-${String(bill.number).padStart(4, '0')}`)
  const openForPayment = $derived(bill.status !== 'paid' && bill.status !== 'void' && bill.balance > 0)
  const voidable = $derived(bill.status !== 'void' && bill.paid === 0 && (bill.credited ?? 0) === 0)

  const history = $derived(
    [
      ...payments.map((p) => ({ kind: 'payment' as const, _id: p._id, date: p.date, label: p.method ?? '—', amount: p.amount })),
      ...credits.map((c) => ({ kind: 'credit' as const, _id: c._id, date: c.date, label: `Vendor credit #${c.number}${c.memo ? ` — ${c.memo}` : ''}`, amount: c.amount })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1)),
  )

  const today = new Date().toISOString().slice(0, 10)
  let payAmount = $state('')
  let payDate = $state(today)
  let payMethod = $state('')
  let saving = $state(false)
  let error = $state('')

  let creditAmount = $state('')
  let creditDate = $state(today)
  let creditMemo = $state('')

  async function applyVendorCredit() {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/bills/${bill._id}/credits`, {
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

  async function voidBill() {
    if (!confirm(`Void bill ${num}? This reverses its journal entry (dated today) and cannot be undone.`)) return
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/bills/${bill._id}/void`, { method: 'POST' })
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
      const r = await fetch(`/api/accounting/bills/${bill._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount, date: payDate, method: payMethod }),
      })
      if (!r.ok) throw new Error(await r.text())
      payAmount = ''
      payMethod = ''
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Bill {num} · Blueprint</title></svelte:head>

<AccountingShell {user} title="Bill {num}" maxWidth="820px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Bills', href: '/accounting/bills' }, { label: num }]}>
  {#snippet actions()}
    <StatusBadge status={bill.status} />
    {#if voidable}
      <button class="btn-secondary danger" type="button" onclick={voidBill} disabled={saving}>Void</button>
    {/if}
    <a class="btn-secondary" href="/api/accounting/bills/{bill._id}/pdf" target="_blank" rel="noopener">⬇ PDF</a>
  {/snippet}

  <section class="card">
    <div class="facts">
      <div><span class="k">Vendor</span><span>{bill.vendor_name}</span></div>
      <div><span class="k">Billed</span><span class="mono">{bill.bill_date}</span></div>
      <div><span class="k">Due</span><span class="mono">{bill.due_date}</span></div>
      {#if bill.vendor_invoice_no}<div><span class="k">Vendor inv #</span><span>{bill.vendor_invoice_no}</span></div>{/if}
      {#if bill.po}<div><span class="k">PO</span><span>{bill.po}</span></div>{/if}
    </div>

    <table>
      <thead><tr><th>Account</th><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>
        {#each bill.lines as l, i (i)}
          <tr><td class="mono">{l.account_id}</td><td>{l.description}</td><td class="num">{usd(l.amount)}</td></tr>
        {/each}
      </tbody>
    </table>

    <div class="totals">
      <div class="grand"><span>Total</span><span class="num">{usd(bill.total)}</span></div>
      <div><span>Paid</span><span class="num">{usd(bill.paid)}</span></div>
      <div class="bal"><span>Balance due</span><span class="num">{usd(bill.balance)}</span></div>
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
        <label class="grow">Method<input type="text" bind:value={payMethod} placeholder="check / ACH" /></label>
        <button class="btn-primary" type="button" onclick={recordPayment} disabled={saving || !payAmount.trim()}>
          {saving ? 'Recording…' : 'Record payment'}
        </button>
      </div>
      <details class="credit-box">
        <summary>Apply a vendor credit…</summary>
        <p class="credit-hint">Reduces what you owe this vendor — debits A/P and gives the bill's expense accounts back pro-rata. To cancel an entire unpaid bill, use Void instead.</p>
        <div class="pay-form">
          <label>Amount<input type="text" inputmode="decimal" bind:value={creditAmount} placeholder="0.00" /></label>
          <label>Date<input type="date" bind:value={creditDate} /></label>
          <label class="grow">Reason<input type="text" bind:value={creditMemo} placeholder="why the credit?" /></label>
          <button class="btn-secondary" type="button" onclick={applyVendorCredit} disabled={saving || !creditAmount.trim()}>
            {saving ? 'Working…' : 'Apply credit'}
          </button>
        </div>
      </details>
      {#if error}<p class="error">{error}</p>{/if}
    {:else if bill.status === 'paid'}
      <p class="paid-note">✓ Settled in full{(bill.credited ?? 0) > 0 ? ' (includes credits)' : ''}.</p>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>Files</h2></div>
    <AttachmentsPanel ownerType="bill" ownerId={bill._id} attachments={data.attachments} />
  </section>

  <section class="card">
    <div class="card-head"><h2>Activity</h2></div>
    <ActivityFeed events={data.audit} />
  </section>
</AccountingShell>

<style>
  /* Bill-specific facts/totals/payment layout; shared chrome from accounting.css. */
  .facts { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-bottom: 16px; }
  .facts > div { display: flex; flex-direction: column; gap: 2px; }
  .facts .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }

  .totals { margin-top: 14px; margin-left: auto; max-width: 320px; }
  .totals > div { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; font-size: 13px; color: var(--text-body); }
  .totals .grand { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); padding-top: 8px; }
  .totals .bal { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 4px; padding-top: 8px; }

  .pay-form { display: flex; gap: 10px; align-items: flex-end; margin-top: 14px; flex-wrap: wrap; }
  .pay-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .pay-form .grow { flex: 1; min-width: 140px; }
  .paid-note { color: #047857; font-weight: 600; font-size: 14px; margin-top: 12px; }
  :global(.acct .btn-secondary.danger) { color: #dc2626; border-color: #fca5a5; }
  :global(.acct .btn-secondary.danger:hover:not(:disabled)) { background: #fef2f2; border-color: #dc2626; }
  .credit-box { margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 10px; }
  .credit-box summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .credit-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 4px; max-width: 60ch; }
</style>
