<script lang="ts">
  import { apiError } from '$lib/accounting/api'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import ActivityFeed from '$lib/components/accounting/ActivityFeed.svelte'
  import { usd } from '$lib/accounting/format'
  import { poNumber, remainingLines } from '$lib/accounting/purchaseOrders'
  import { confirmDialog } from '$lib/confirm.svelte'
  import { invalidateAll, goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const po = $derived(data.po)
  const num = $derived(poNumber(po))
  const remaining = $derived(Math.max(0, po.total - po.billed))
  const billable = $derived(po.status === 'open' || po.status === 'partially-billed')

  const today = new Date().toISOString().slice(0, 10)
  let billDate = $state(today)
  let vendorInvoiceNo = $state('')
  let saving = $state(false)
  let error = $state('')

  // Convert form drafts the unbilled remainder; the user can edit amounts.
  type DraftLine = { account_id: string; description: string; amount: string }
  let draft = $state<DraftLine[]>([])
  let showConvert = $state(false)
  function openConvert() {
    draft = remainingLines(po.lines, po.total, po.billed).map((l) => ({
      account_id: l.account_id, description: l.description, amount: (l.amount / 100).toFixed(2),
    }))
    showConvert = true
  }

  async function act(action: 'close' | 'cancel') {
    // "Cancel this PO?" with a button also labeled Cancel is a coin flip —
    // name both actions explicitly.
    const ok = action === 'close'
      ? await confirmDialog({ title: `Close PO ${num}?`, body: 'No further billing is expected against it.', confirmLabel: 'Close PO' })
      : await confirmDialog({ title: `Cancel PO ${num}?`, confirmLabel: 'Cancel PO', cancelLabel: 'Keep it', danger: true })
    if (!ok) return
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/purchase-orders/${po._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!r.ok) throw new Error(await apiError(r))
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function convert() {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/purchase-orders/${po._id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_date: billDate,
          vendor_invoice_no: vendorInvoiceNo || undefined,
          lines: draft.filter((l) => l.amount.trim()),
        }),
      })
      if (!r.ok) throw new Error(await apiError(r))
      const bill = await r.json()
      await goto(`/accounting/bills/${bill._id}`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>{num} · Blueprint</title></svelte:head>

<AccountingShell {user} title={num} maxWidth="820px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Purchase orders', href: '/accounting/purchase-orders' }, { label: num }]}>
  {#snippet actions()}
    <span class="chip">{po.status.replace('-', ' ')}</span>
    {#if billable}
      <button class="btn-secondary" type="button" onclick={() => act('close')} disabled={saving}>Close</button>
    {/if}
    {#if po.status === 'open' && po.billed === 0}
      <button class="btn-secondary danger" type="button" onclick={() => act('cancel')} disabled={saving}>Cancel PO</button>
    {/if}
    <a class="btn-secondary" href="/api/accounting/purchase-orders/{po._id}/pdf" target="_blank" rel="noopener">⬇ PDF</a>
  {/snippet}

  <section class="card">
    <div class="facts">
      <div><span class="k">Vendor</span><span>{po.vendor_name}</span></div>
      <div><span class="k">PO date</span><span class="mono">{po.date}</span></div>
      {#if po.expected_date}<div><span class="k">Expected</span><span class="mono">{po.expected_date}</span></div>{/if}
      {#if po.job}<div><span class="k">Job</span><span>{po.job}</span></div>{/if}
    </div>
    {#if po.memo}<p class="memo">{po.memo}</p>{/if}

    <table>
      <thead><tr><th>Account</th><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>
        {#each po.lines as l, i (i)}
          <tr><td class="mono">{l.account_id}</td><td>{l.description}</td><td class="num">{usd(l.amount)}</td></tr>
        {/each}
      </tbody>
    </table>

    <div class="totals">
      <div class="grand"><span>Total</span><span class="num">{usd(po.total)}</span></div>
      <div><span>Billed</span><span class="num">{usd(po.billed)}</span></div>
      <div class="bal"><span>Remaining</span><span class="num">{usd(remaining)}</span></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Bills against this PO</h2></div>
    {#if po.bills.length === 0}
      <p class="empty">Nothing billed yet.</p>
    {:else}
      <table>
        <thead><tr><th>Bill</th><th>Date</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>
          {#each po.bills as b (b._id)}
            <tr class="row-link" onclick={() => goto(`/accounting/bills/${b._id}`)}>
              <td class="mono"><a class="row-anchor" href={`/accounting/bills/${b._id}`} onclick={(e) => e.stopPropagation()}>#{b.year}-{String(b.number).padStart(4, '0')}</a></td>
              <td class="mono">{b.bill_date}</td>
              <td class="num">{usd(b.total)}</td>
              <td><span class="chip">{b.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if billable && remaining > 0}
      {#if !showConvert}
        <div class="convert-cta">
          <button class="btn-primary" type="button" onclick={openConvert}>Convert to bill…</button>
        </div>
      {:else}
        <div class="convert-form">
          <div class="meta-row">
            <label>Bill date<input type="date" bind:value={billDate} /></label>
            <label class="grow">Vendor inv # (optional)<input type="text" bind:value={vendorInvoiceNo} /></label>
          </div>
          {#each draft as l, i (i)}
            <div class="draft-line">
              <span class="mono">{l.account_id}</span>
              <span class="desc">{l.description}</span>
              <input class="num" type="text" inputmode="decimal" bind:value={l.amount} aria-label="Amount" />
            </div>
          {/each}
          <div class="convert-actions">
            <button class="btn-secondary" type="button" onclick={() => (showConvert = false)} disabled={saving}>Back</button>
            <button class="btn-primary" type="button" onclick={convert} disabled={saving}>
              {saving ? 'Posting…' : 'Create & post bill'}
            </button>
          </div>
        </div>
      {/if}
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>Activity</h2></div>
    <ActivityFeed events={data.audit} />
  </section>
</AccountingShell>

<style>
  .facts { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-bottom: 14px; }
  .facts > div { display: flex; flex-direction: column; gap: 2px; }
  .facts .k { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }
  .memo { color: var(--text-body); font-size: var(--font-md); margin: 0 0 12px; }
  .totals { margin-top: 14px; margin-left: auto; max-width: 320px; }
  .totals > div { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; font-size: var(--font-base); color: var(--text-body); }
  .totals .grand { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); margin-top: 4px; padding-top: 8px; }
  .totals .bal { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 4px; padding-top: 8px; }
  .convert-cta { margin-top: 14px; display: flex; justify-content: flex-end; }
  .convert-form { margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 12px; }
  .meta-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .meta-row label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: var(--text-body); }
  .meta-row .grow { flex: 1; min-width: 160px; }
  .draft-line { display: grid; grid-template-columns: 60px 1fr 130px; gap: 10px; align-items: center; padding: 4px 0; font-size: var(--font-base); }
  .draft-line .num { text-align: right; }
  .convert-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
  :global(.acct .btn-secondary.danger) { color: var(--danger); border-color: var(--danger-border); }
</style>
