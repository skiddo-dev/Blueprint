<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto } from '$app/navigation'
  import { parseMoney } from '$lib/money'
  import { usd } from '$lib/accounting/format'
  import { dueDate } from '$lib/accounting/invoicing'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const vendors = $derived(data.vendors)
  const accounts = $derived(data.expenseAccounts)

  const today = new Date().toISOString().slice(0, 10)
  let vendorName = $state('')
  let vendorEmail = $state('')
  let billDate = $state(today)
  let netDays = $state(30)
  let vendorInvoiceNo = $state('')
  let po = $state('')
  let job = $state('')
  let memo = $state('')

  type Line = { account_id: string; description: string; amount: string }
  const blank = (): Line => ({ account_id: '', description: '', amount: '' })
  let lines = $state<Line[]>([blank()])

  let saving = $state(false)
  let error = $state('')

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
          type: 'bill',
          name: recName.trim() || `${vendorName} — recurring bill`,
          cadence: { unit: recUnit, interval: Number(recInterval) || 1 },
          next_date: recStart,
          payload: {
            vendor_name: vendorName,
            vendor_email: vendorEmail,
            net_days: Number(netDays) || 30,
            po,
            job: job.trim() || undefined,
            memo,
            lines: lines.map((l) => ({ account_id: l.account_id, description: l.description, amount: l.amount })),
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

  function amtCents(s: string): number {
    const t = s.trim()
    if (!t) return NaN
    try { return parseMoney(t) } catch { return NaN }
  }

  let amounts = $derived(lines.map((l) => amtCents(l.amount)))
  let total = $derived(amounts.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0))
  let due = $derived(/^\d{4}-\d{2}-\d{2}$/.test(billDate) ? dueDate(billDate, Number(netDays) || 0) : '—')

  let anyInvalid = $derived(lines.some((l, i) => !l.account_id || !(amounts[i] > 0)))
  let canSubmit = $derived(!anyInvalid && total > 0 && vendorName.trim() !== '' && !saving)

  function addLine() { lines = [...lines, blank()] }
  function removeLine(i: number) { if (lines.length > 1) lines = lines.filter((_, j) => j !== i) }

  async function submit() {
    saving = true
    error = ''
    try {
      const r = await fetch('/api/accounting/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_name: vendorName,
          vendor_email: vendorEmail,
          bill_date: billDate,
          net_days: Number(netDays) || 30,
          vendor_invoice_no: vendorInvoiceNo,
          po,
          job: job.trim() || undefined,
          memo,
          lines: lines.map((l) => ({ account_id: l.account_id, description: l.description, amount: l.amount })),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const bill = await r.json()
      await goto(`/accounting/bills/${bill._id}`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>New bill · Blueprint</title></svelte:head>

<AccountingShell {user} title="New bill" maxWidth="860px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Bills', href: '/accounting/bills' }, { label: 'New' }]}>
  <section class="card">
    <div class="meta-grid">
      <label class="grow">Vendor
        <input type="text" list="vendor-list" bind:value={vendorName} placeholder="Vendor / subcontractor" />
        <datalist id="vendor-list">{#each vendors as v (v._id)}<option value={v.name}></option>{/each}</datalist>
      </label>
      <label class="grow">Email (optional)<input type="email" bind:value={vendorEmail} placeholder="ap@vendor.com" /></label>
    </div>
    <div class="meta-grid">
      <label>Bill date<input type="date" bind:value={billDate} /></label>
      <label>Net days<input type="number" min="0" bind:value={netDays} /></label>
      <label>Due date<input type="text" value={due} readonly class="readonly" /></label>
      <label>Vendor inv #<input type="text" bind:value={vendorInvoiceNo} placeholder="optional" /></label>
      <label>PO<input type="text" bind:value={po} placeholder="optional" /></label>
      <label>Job
        <input type="text" list="job-list" bind:value={job} placeholder="optional" />
        <datalist id="job-list">{#each data.jobs as j (j)}<option value={j}></option>{/each}</datalist>
      </label>
    </div>

    <div class="lines">
      <div class="lines-head"><span>Expense account</span><span>Description</span><span class="num">Amount</span><span></span></div>
      {#each lines as line, i (i)}
        <div class="line">
          <select bind:value={line.account_id} aria-label="Account">
            <option value="" disabled>Select account…</option>
            {#each accounts as a (a.code)}<option value={a.code}>{a.code} · {a.name}</option>{/each}
          </select>
          <input type="text" bind:value={line.description} placeholder="What was this for?" aria-label="Description" />
          <input class="num" type="text" inputmode="decimal" bind:value={line.amount} placeholder="0.00" aria-label="Amount" />
          <button class="remove" type="button" onclick={() => removeLine(i)} disabled={lines.length <= 1} aria-label="Remove line">✕</button>
        </div>
      {/each}
      <button class="add" type="button" onclick={addLine}>+ Add line</button>
    </div>

    <div class="totals">
      <span>Total</span><span class="num">{usd(total)}</span>
    </div>

    <label class="memo">Memo (optional)<input type="text" bind:value={memo} placeholder="Notes for this bill" /></label>

    <details class="recurring-box">
      <summary><Icon name="recurring" size={12} /> Make this recurring…</summary>
      <div class="rec-grid">
        <label>Template name<input type="text" bind:value={recName} placeholder="e.g. Office rent — monthly" /></label>
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
      <a class="btn-secondary" href="/accounting/bills">Cancel</a>
      <button class="btn-primary" type="button" onclick={submit} disabled={!canSubmit}>
        {saving ? 'Creating…' : 'Create & post bill'}
      </button>
    </div>
  </section>
</AccountingShell>

<style>
  /* Bespoke bill-form layout; shared primitives come from accounting.css. */
  label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-base); font-weight: 600; color: var(--text-body); }
  .meta-grid input, .line input, .line select, .memo input { width: 100%; }

  .meta-grid { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .meta-grid .grow { flex: 1; min-width: 220px; }
  .meta-grid > label { flex: 1; min-width: 110px; }

  .lines { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px; margin-bottom: 14px; }
  .lines-head, .line { display: grid; grid-template-columns: 2fr 2.4fr 1.2fr 34px; gap: 8px; align-items: center; }
  .lines-head { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; padding: 0 2px 6px; }
  .line { margin-bottom: 8px; }
  input.num { text-align: right; }
  .remove { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-muted); height: 34px; cursor: pointer; }
  .remove:hover:not(:disabled) { border-color: var(--danger-border); color: var(--danger); }
  .remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .add { margin-top: 4px; background: none; border: 1px dashed var(--border); border-radius: var(--radius-md); color: var(--primary-text); padding: 7px 12px; font-size: var(--font-base); font-weight: 600; cursor: pointer; }
  .add:hover { border-color: var(--primary); }

  .totals { display: flex; justify-content: flex-end; gap: 24px; align-items: center; font-weight: 700; color: var(--text); font-size: var(--font-lg); padding: 6px 36px 6px 0; border-top: 2px solid var(--border); }
  .totals .num { min-width: 120px; }

  .memo { margin-top: 14px; }
  .recurring-box { margin-top: 16px; border-top: 1px dashed var(--border); padding-top: 10px; }
  .recurring-box summary { cursor: pointer; font-size: var(--font-base); font-weight: 600; color: var(--text-muted); }
  .rec-grid { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-top: 10px; }
  .rec-grid label:first-child { flex: 1; min-width: 220px; }
  .rec-grid input[type='number'] { width: 70px; }
  .rec-hint { font-size: var(--font-sm); color: var(--text-muted); margin: 8px 0 0; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

  @media (max-width: 640px) {
    .lines-head { display: none; }
    .line { grid-template-columns: 1fr 1fr; }
    .line select { grid-column: 1 / 3; }
  }
</style>
