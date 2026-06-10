<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto } from '$app/navigation'
  import { parseMoney } from '$lib/money'
  import { usd } from '$lib/accounting/format'
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
  let date = $state(today)
  let expectedDate = $state('')
  let job = $state('')
  let memo = $state('')

  type Line = { account_id: string; description: string; amount: string }
  const blank = (): Line => ({ account_id: '', description: '', amount: '' })
  let lines = $state<Line[]>([blank()])

  let saving = $state(false)
  let error = $state('')

  function amtCents(s: string): number {
    const t = s.trim()
    if (!t) return NaN
    try { return parseMoney(t) } catch { return NaN }
  }
  let amounts = $derived(lines.map((l) => amtCents(l.amount)))
  let total = $derived(amounts.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0))
  let anyInvalid = $derived(lines.some((l, i) => !l.account_id || !(amounts[i] > 0)))
  let canSubmit = $derived(!anyInvalid && total > 0 && vendorName.trim() !== '' && !saving)

  function addLine() { lines = [...lines, blank()] }
  function removeLine(i: number) { if (lines.length > 1) lines = lines.filter((_, j) => j !== i) }

  async function submit() {
    saving = true
    error = ''
    try {
      const r = await fetch('/api/accounting/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_name: vendorName,
          vendor_email: vendorEmail,
          date,
          expected_date: expectedDate || undefined,
          job: job.trim() || undefined,
          memo,
          lines: lines.map((l) => ({ account_id: l.account_id, description: l.description, amount: l.amount })),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const po = await r.json()
      await goto(`/accounting/purchase-orders/${po._id}`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>New purchase order · Blueprint</title></svelte:head>

<AccountingShell {user} title="New purchase order" maxWidth="860px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Purchase orders', href: '/accounting/purchase-orders' }, { label: 'New' }]}>
  <section class="card">
    <p class="report-hint">Commits spend with a vendor — nothing posts to the books until you convert it to a bill.</p>
    <div class="meta-grid">
      <label class="grow">Vendor
        <input type="text" list="vendor-list" bind:value={vendorName} placeholder="Vendor / subcontractor" />
        <datalist id="vendor-list">{#each vendors as v (v._id)}<option value={v.name}></option>{/each}</datalist>
      </label>
      <label class="grow">Email (optional)<input type="email" bind:value={vendorEmail} placeholder="ap@vendor.com" /></label>
    </div>
    <div class="meta-grid">
      <label>PO date<input type="date" bind:value={date} /></label>
      <label>Expected (optional)<input type="date" bind:value={expectedDate} /></label>
      <label class="grow">Job (optional)
        <input type="text" list="job-list" bind:value={job} placeholder="job / project" />
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
          <input type="text" bind:value={line.description} placeholder="What's being ordered?" aria-label="Description" />
          <input class="num" type="text" inputmode="decimal" bind:value={line.amount} placeholder="0.00" aria-label="Amount" />
          <button class="remove" type="button" onclick={() => removeLine(i)} disabled={lines.length <= 1} aria-label="Remove line">✕</button>
        </div>
      {/each}
      <button class="add" type="button" onclick={addLine}>+ Add line</button>
    </div>

    <div class="totals"><span>Total</span><span class="num">{usd(total)}</span></div>
    <label class="memo">Memo (optional)<input type="text" bind:value={memo} placeholder="Notes for this PO" /></label>

    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <a class="btn-secondary" href="/accounting/purchase-orders">Cancel</a>
      <button class="btn-primary" type="button" onclick={submit} disabled={!canSubmit}>
        {saving ? 'Creating…' : 'Create PO'}
      </button>
    </div>
  </section>
</AccountingShell>

<style>
  /* Same bespoke line-grid as the bill form; shared primitives from accounting.css. */
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--text-body); }
  .meta-grid input, .line input, .line select, .memo input { width: 100%; }
  .meta-grid { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .meta-grid .grow { flex: 1; min-width: 220px; }
  .meta-grid > label { flex: 1; min-width: 110px; }
  .lines { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 14px; }
  .lines-head, .line { display: grid; grid-template-columns: 2fr 2.4fr 1.2fr 34px; gap: 8px; align-items: center; }
  .lines-head { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; padding: 0 2px 6px; }
  .line { margin-bottom: 8px; }
  input.num { text-align: right; }
  .remove { background: var(--card-bg); border: 1px solid var(--border); border-radius: 7px; color: var(--text-muted); height: 34px; cursor: pointer; }
  .remove:hover:not(:disabled) { border-color: #fca5a5; color: #dc2626; }
  .remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .add { margin-top: 4px; background: none; border: 1px dashed var(--border); border-radius: 7px; color: var(--primary-text); padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .add:hover { border-color: var(--primary); }
  .totals { display: flex; justify-content: flex-end; gap: 24px; align-items: center; font-weight: 700; color: var(--text); font-size: 15px; padding: 6px 36px 6px 0; border-top: 2px solid var(--border); }
  .totals .num { min-width: 120px; }
  .memo { margin-top: 14px; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  @media (max-width: 640px) {
    .lines-head { display: none; }
    .line { grid-template-columns: 1fr 1fr; }
    .line select { grid-column: 1 / 3; }
  }
</style>
