<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { goto } from '$app/navigation'
  import { parseMoney } from '$lib/money'
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
  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

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

<PageShell {user} title="🧾 New bill" maxWidth="860px">
  {#snippet head()}
    <h1>🧾 New bill</h1>
    <p class="sub"><a href="/accounting/bills">Bills</a> · New</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

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

  {#if error}<p class="error">{error}</p>{/if}

  <div class="actions">
    <a class="btn-secondary" href="/accounting/bills">Cancel</a>
    <button class="btn-primary" type="button" onclick={submit} disabled={!canSubmit}>
      {saving ? 'Creating…' : 'Create & post bill'}
    </button>
  </div>
</PageShell>

<style>
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }

  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--text-body); }
  input, select { font: inherit; font-weight: 400; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); width: 100%; }
  input:focus, select:focus { outline: none; border-color: var(--primary); }
  .readonly { background: var(--card-bg); color: var(--text-muted); }

  .meta-grid { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .meta-grid .grow { flex: 1; min-width: 220px; }
  .meta-grid > label { flex: 1; min-width: 110px; }

  .lines { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 14px; }
  .lines-head, .line { display: grid; grid-template-columns: 2fr 2.4fr 1.2fr 34px; gap: 8px; align-items: center; }
  .lines-head { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; padding: 0 2px 6px; }
  .line { margin-bottom: 8px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  input.num { text-align: right; }
  .remove { background: var(--bg); border: 1px solid var(--border); border-radius: 7px; color: var(--text-muted); height: 34px; cursor: pointer; }
  .remove:hover:not(:disabled) { border-color: #fca5a5; color: #dc2626; }
  .remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .add { margin-top: 4px; background: none; border: 1px dashed var(--border); border-radius: 7px; color: var(--primary-text); padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .add:hover { border-color: var(--primary); }

  .totals { display: flex; justify-content: flex-end; gap: 24px; align-items: center; font-weight: 700; color: var(--text); font-size: 15px; padding: 6px 36px 6px 0; border-top: 2px solid var(--border); }
  .totals .num { min-width: 120px; }

  .memo { margin-top: 14px; }
  .error { color: #dc2626; font-size: 13px; background: #fee2e2; border-radius: 8px; padding: 8px 12px; margin-top: 12px; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  .btn-primary { background: var(--primary); color: #fff; border: 1px solid var(--primary); border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { background: var(--bg); color: var(--text-body); border: 1px solid var(--border); border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; text-decoration: none; }

  @media (max-width: 640px) {
    .lines-head { display: none; }
    .line { grid-template-columns: 1fr 1fr; }
    .line select { grid-column: 1 / 3; }
  }
</style>
