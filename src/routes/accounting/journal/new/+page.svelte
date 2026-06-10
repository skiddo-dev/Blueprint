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
  const accounts = $derived(data.accounts)

  const today = new Date().toISOString().slice(0, 10)
  let date = $state(today)
  let memo = $state('')

  type Line = { account_id: string; debit: string; credit: string; memo: string }
  const blank = (): Line => ({ account_id: '', debit: '', credit: '', memo: '' })
  let lines = $state<Line[]>([blank(), blank()])

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
          type: 'journal',
          name: recName.trim() || (memo || 'Recurring journal entry'),
          cadence: { unit: recUnit, interval: Number(recInterval) || 1 },
          next_date: recStart,
          payload: {
            memo,
            lines: lines.map((l) => ({ account_id: l.account_id, debit: l.debit, credit: l.credit })),
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

  // Parse a dollar field to cents for the live balance preview; '' → 0, junk → NaN.
  // The server re-parses authoritatively on submit; this only drives the UI.
  function toCents(s: string): number {
    const t = s.trim()
    if (!t) return 0
    try { return parseMoney(t) } catch { return NaN }
  }

  let totalDebit = $derived(lines.reduce((a, l) => a + (toCents(l.debit) || 0), 0))
  let totalCredit = $derived(lines.reduce((a, l) => a + (toCents(l.credit) || 0), 0))
  let difference = $derived(totalDebit - totalCredit)
  let anyInvalid = $derived(lines.some((l) => Number.isNaN(toCents(l.debit)) || Number.isNaN(toCents(l.credit))))
  // Each filled line must have an account and exactly one of debit/credit.
  let linesOk = $derived(
    lines.every((l) => {
      const d = toCents(l.debit) > 0
      const c = toCents(l.credit) > 0
      return l.account_id !== '' && d !== c
    }),
  )
  let canSubmit = $derived(!anyInvalid && linesOk && difference === 0 && totalDebit > 0 && !saving)

  function addLine() { lines = [...lines, blank()] }
  function removeLine(i: number) { if (lines.length > 2) lines = lines.filter((_, j) => j !== i) }

  async function submit() {
    saving = true
    error = ''
    try {
      const r = await fetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          memo,
          lines: lines.map((l) => ({ account_id: l.account_id, debit: l.debit, credit: l.credit, memo: l.memo })),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      await goto('/accounting')
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>New journal entry · Blueprint</title></svelte:head>

<AccountingShell {user} title="📒 New journal entry" maxWidth="820px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Journal entry' }]}>
  <p class="form-hint">Debits must equal credits before you can post.</p>

  <section class="card">
    <div class="meta-grid">
      <label>Date<input type="date" bind:value={date} /></label>
      <label class="grow">Memo<input type="text" bind:value={memo} placeholder="What is this entry for?" /></label>
    </div>

    <div class="lines">
      <div class="lines-head">
        <span>Account</span><span class="num">Debit</span><span class="num">Credit</span><span>Line memo</span><span></span>
      </div>
      {#each lines as line, i (i)}
        <div class="line">
          <select bind:value={line.account_id} aria-label="Account">
            <option value="" disabled>Select account…</option>
            {#each accounts as a (a.code)}
              <option value={a.code}>{a.code} · {a.name}</option>
            {/each}
          </select>
          <input class="num" type="text" inputmode="decimal" bind:value={line.debit} placeholder="0.00" aria-label="Debit" />
          <input class="num" type="text" inputmode="decimal" bind:value={line.credit} placeholder="0.00" aria-label="Credit" />
          <input type="text" bind:value={line.memo} placeholder="(optional)" aria-label="Line memo" />
          <button class="remove" type="button" onclick={() => removeLine(i)} disabled={lines.length <= 2} aria-label="Remove line">✕</button>
        </div>
      {/each}
      <button class="add" type="button" onclick={addLine}>+ Add line</button>
    </div>

    <div class="totals" class:balanced={difference === 0 && totalDebit > 0}>
      <span class="totals-label">Totals</span>
      <span class="num">{usd(totalDebit)}</span>
      <span class="num">{usd(totalCredit)}</span>
      <span class="diff">
        {#if difference === 0 && totalDebit > 0}✓ Balanced
        {:else if anyInvalid}Check amounts
        {:else}Off by {usd(Math.abs(difference))}{/if}
      </span>
    </div>

    <details class="recurring-box">
      <summary>🔁 Make this recurring…</summary>
      <div class="rec-grid">
        <label>Template name<input type="text" bind:value={recName} placeholder="e.g. Monthly depreciation" /></label>
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
      <a class="btn-secondary" href="/accounting">Cancel</a>
      <button class="btn-primary" type="button" onclick={submit} disabled={!canSubmit}>
        {saving ? 'Posting…' : 'Post entry'}
      </button>
    </div>
  </section>
</AccountingShell>

<style>
  /* Bespoke journal grid; shared primitives come from accounting.css. */
  .form-hint { color: var(--text-muted); font-size: 13px; margin: -6px 0 16px; }
  .meta-grid { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .meta-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--text-body); }
  .meta-grid .grow { flex: 1; min-width: 220px; }
  .meta-grid input { width: 100%; }

  .lines { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
  .lines-head, .line { display: grid; grid-template-columns: 2.2fr 1fr 1fr 1.6fr 34px; gap: 8px; align-items: center; }
  .lines-head { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; padding: 0 2px 6px; }
  .line { margin-bottom: 8px; }
  .line select, .line input { width: 100%; }
  input.num { text-align: right; }
  .remove { background: var(--card-bg); border: 1px solid var(--border); border-radius: 7px; color: var(--text-muted); height: 34px; cursor: pointer; }
  .remove:hover:not(:disabled) { border-color: #fca5a5; color: #dc2626; }
  .remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .add { margin-top: 4px; background: none; border: 1px dashed var(--border); border-radius: 7px; color: var(--primary-text); padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .add:hover { border-color: var(--primary); }

  .totals {
    display: grid; grid-template-columns: 2.2fr 1fr 1fr 1.6fr 34px; gap: 8px; align-items: center;
    margin-top: 14px; padding: 10px 2px; border-top: 2px solid var(--border); font-weight: 700; color: var(--text);
  }
  .totals-label { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .totals .num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals .diff { grid-column: 4 / 6; font-size: 13px; color: #b45309; font-weight: 600; }
  .totals.balanced .diff { color: #047857; }

  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  .recurring-box { margin-top: 16px; border-top: 1px dashed var(--border); padding-top: 10px; }
  .recurring-box summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .rec-grid { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-top: 10px; }
  .rec-grid label:first-child { flex: 1; min-width: 220px; }
  .rec-grid input[type='number'] { width: 70px; }
  .rec-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; }

  @media (max-width: 640px) {
    .lines-head { display: none; }
    .line, .totals { grid-template-columns: 1fr 1fr; }
    .line select, .line input[aria-label='Line memo'] { grid-column: 1 / 3; }
    .totals .diff { grid-column: 1 / 3; }
  }
</style>
