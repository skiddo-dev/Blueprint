<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { parseMoney } from '$lib/money'
  import { usd } from '$lib/accounting/format'
  import { dueDate } from '$lib/accounting/invoicing'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const customers = $derived(data.customers)
  const wonQuotes = $derived(data.wonQuotes)

  const today = new Date().toISOString().slice(0, 10)
  let customerName = $state('')
  let customerEmail = $state('')
  let issueDate = $state(today)
  let netDays = $state(30)
  let taxRate = $state(0)
  let po = $state('')
  let quoteId = $state('')
  let job = $state('')
  let memo = $state('')

  type Line = { description: string; quantity: string; unit_price: string }
  const blank = (): Line => ({ description: '', quantity: '1', unit_price: '' })
  let lines = $state<Line[]>([blank()])

  let saving = $state(false)
  let error = $state('')

  // "Make this recurring": snapshot the current form into a schedule template.
  let recName = $state('')
  let recInterval = $state(1)
  let recUnit = $state<'week' | 'month'>('month')
  let recStart = $state(today)

  async function saveRecurring() {
    saving = true
    error = ''
    try {
      const r = await fetch('/api/accounting/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          name: recName.trim() || `${customerName} — recurring invoice`,
          cadence: { unit: recUnit, interval: Number(recInterval) || 1 },
          next_date: recStart,
          payload: {
            customer_name: customerName,
            customer_email: customerEmail,
            net_days: Number(netDays) || 30,
            tax_rate: Number(taxRate) || 0,
            po,
            job: job.trim() || undefined,
            memo,
            lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unit_price: l.unit_price })),
          },
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      await goto('/accounting/recurring')
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  function priceCents(s: string): number {
    const t = s.trim()
    if (!t) return NaN
    try { return parseMoney(t) } catch { return NaN }
  }

  let amounts = $derived(lines.map((l) => {
    const up = priceCents(l.unit_price)
    const qty = Number(l.quantity)
    return Number.isNaN(up) || !Number.isFinite(qty) ? NaN : Math.round(up * qty)
  }))
  let subtotal = $derived(amounts.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0))
  let tax = $derived(Math.round((subtotal * (Number(taxRate) || 0)) / 100))
  let total = $derived(subtotal + tax)
  let due = $derived(/^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? dueDate(issueDate, Number(netDays) || 0) : '—')

  let anyInvalid = $derived(amounts.some((n) => Number.isNaN(n)) || lines.some((l) => !l.description.trim()))
  let canSubmit = $derived(!anyInvalid && total > 0 && customerName.trim() !== '' && !saving)

  function addLine() { lines = [...lines, blank()] }
  function removeLine(i: number) { if (lines.length > 1) lines = lines.filter((_, j) => j !== i) }

  function applyQuote() {
    const q = wonQuotes.find((x) => x._id === quoteId)
    if (!q) return
    lines = [{ description: q.description || 'Contract work', quantity: '1', unit_price: String(q.amount ?? '') }]
    if (q.po) po = q.po
    if (!job.trim() && q.description) job = q.description
  }

  // Prefill from a ?quote=<id> link (the dashboard "Create invoice" shortcut).
  let prefilled = false
  $effect(() => {
    if (prefilled) return
    const qid = page.url.searchParams.get('quote')
    if (qid && wonQuotes.some((x) => x._id === qid)) {
      quoteId = qid
      applyQuote()
      prefilled = true
    }
  })

  async function submit() {
    saving = true
    error = ''
    try {
      const r = await fetch('/api/accounting/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_email: customerEmail,
          issue_date: issueDate,
          net_days: Number(netDays) || 30,
          tax_rate: Number(taxRate) || 0,
          po,
          quote_id: quoteId || undefined,
          job: job.trim() || undefined,
          memo,
          lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unit_price: l.unit_price })),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const inv = await r.json()
      await goto(`/accounting/invoices/${inv._id}`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>New invoice · Blueprint</title></svelte:head>

<AccountingShell {user} title="📄 New invoice" maxWidth="860px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Invoices', href: '/accounting/invoices' }, { label: 'New' }]}>
  <section class="card">
    {#if wonQuotes.length}
      <label class="from-quote">
        Start from a won quote (optional)
        <select bind:value={quoteId} onchange={applyQuote}>
          <option value="">— none —</option>
          {#each wonQuotes as q (q._id)}
            <option value={q._id}>
              {q.year}{q.quote_number ? `-${q.quote_number}` : ''} · {q.description || 'Quote'} · ${q.amount?.toLocaleString('en-US')}
            </option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="meta-grid">
      <label class="grow">Customer
        <input type="text" list="customer-list" bind:value={customerName} placeholder="Customer name" />
        <datalist id="customer-list">
          {#each customers as c (c._id)}<option value={c.name}></option>{/each}
        </datalist>
      </label>
      <label class="grow">Email (optional)<input type="email" bind:value={customerEmail} placeholder="billing@customer.com" /></label>
    </div>
    <div class="meta-grid">
      <label>Issue date<input type="date" bind:value={issueDate} /></label>
      <label>Net days<input type="number" min="0" bind:value={netDays} /></label>
      <label>Due date<input type="text" value={due} readonly class="readonly" /></label>
      <label>PO (optional)<input type="text" bind:value={po} placeholder="PO #" /></label>
      <label>Job (optional)
        <input type="text" list="job-list" bind:value={job} placeholder="job / project" />
        <datalist id="job-list">{#each data.jobs as j (j)}<option value={j}></option>{/each}</datalist>
      </label>
    </div>

    <div class="lines">
      <div class="lines-head"><span>Description</span><span class="num">Qty</span><span class="num">Unit price</span><span class="num">Amount</span><span></span></div>
      {#each lines as line, i (i)}
        <div class="line">
          <input type="text" bind:value={line.description} placeholder="Work / item description" aria-label="Description" />
          <input class="num" type="text" inputmode="decimal" bind:value={line.quantity} aria-label="Quantity" />
          <input class="num" type="text" inputmode="decimal" bind:value={line.unit_price} placeholder="0.00" aria-label="Unit price" />
          <span class="num amount">{Number.isFinite(amounts[i]) ? usd(amounts[i]) : '—'}</span>
          <button class="remove" type="button" onclick={() => removeLine(i)} disabled={lines.length <= 1} aria-label="Remove line">✕</button>
        </div>
      {/each}
      <button class="add" type="button" onclick={addLine}>+ Add line</button>
    </div>

    <div class="totals">
      <label class="taxrate">Tax rate %<input type="number" min="0" step="0.01" bind:value={taxRate} /></label>
      <div class="totals-figures">
        <div><span>Subtotal</span><span class="num">{usd(subtotal)}</span></div>
        <div><span>Tax</span><span class="num">{usd(tax)}</span></div>
        <div class="grand"><span>Total</span><span class="num">{usd(total)}</span></div>
      </div>
    </div>

    <label class="memo">Memo (optional)<input type="text" bind:value={memo} placeholder="Notes for this invoice" /></label>

    <details class="recurring-box">
      <summary>🔁 Make this recurring…</summary>
      <div class="rec-grid">
        <label>Template name<input type="text" bind:value={recName} placeholder="e.g. Monthly retainer — {customerName || 'customer'}" /></label>
        <label>Every<input type="number" min="1" bind:value={recInterval} /></label>
        <label>Unit
          <select bind:value={recUnit}><option value="month">month(s)</option><option value="week">week(s)</option></select>
        </label>
        <label>First run<input type="date" bind:value={recStart} /></label>
        <button class="btn-secondary" type="button" onclick={saveRecurring} disabled={!canSubmit}>Save schedule</button>
      </div>
      <p class="rec-hint">Saves the schedule only — nothing posts until the first run date. Manage it under Recurring.</p>
    </details>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="actions">
      <a class="btn-secondary" href="/accounting/invoices">Cancel</a>
      <button class="btn-primary" type="button" onclick={submit} disabled={!canSubmit}>
        {saving ? 'Creating…' : 'Create & post invoice'}
      </button>
    </div>
  </section>
</AccountingShell>

<style>
  /* Bespoke invoice-form layout; shared primitives (buttons, inputs, card, error)
     come from accounting.css. */
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--text-body); }
  .from-quote select, .meta-grid input, .line input, .memo input, .taxrate input { width: 100%; }

  .from-quote { margin-bottom: 16px; }
  .meta-grid { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .meta-grid .grow { flex: 1; min-width: 220px; }
  .meta-grid > label { flex: 1; min-width: 120px; }

  .lines { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 14px; }
  .lines-head, .line { display: grid; grid-template-columns: 3fr 0.8fr 1.2fr 1.2fr 34px; gap: 8px; align-items: center; }
  .lines-head { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; padding: 0 2px 6px; }
  .line { margin-bottom: 8px; }
  input.num { text-align: right; }
  .amount { font-weight: 600; color: var(--text); padding-right: 2px; }
  .remove { background: var(--card-bg); border: 1px solid var(--border); border-radius: 7px; color: var(--text-muted); height: 34px; cursor: pointer; }
  .remove:hover:not(:disabled) { border-color: #fca5a5; color: #dc2626; }
  .remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .add { margin-top: 4px; background: none; border: 1px dashed var(--border); border-radius: 7px; color: var(--primary-text); padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .add:hover { border-color: var(--primary); }

  .totals { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .taxrate { max-width: 120px; }
  .totals-figures { min-width: 240px; margin-left: auto; }
  .totals-figures > div { display: flex; justify-content: space-between; gap: 24px; padding: 4px 0; font-size: 13px; color: var(--text-body); }
  .totals-figures .grand { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); margin-top: 4px; padding-top: 8px; font-size: 15px; }

  .memo { margin-top: 14px; }
  .recurring-box { margin-top: 16px; border-top: 1px dashed var(--border); padding-top: 10px; }
  .recurring-box summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .rec-grid { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-top: 10px; }
  .rec-grid label:first-child { flex: 1; min-width: 220px; }
  .rec-grid input[type='number'] { width: 70px; }
  .rec-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

  @media (max-width: 640px) {
    .lines-head { display: none; }
    .line { grid-template-columns: 1fr 1fr; }
    .line input[aria-label='Description'] { grid-column: 1 / 3; }
  }
</style>
