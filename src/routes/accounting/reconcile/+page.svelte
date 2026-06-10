<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto, invalidateAll } from '$app/navigation'
  import { parseMoney } from '$lib/money'
  import { usd } from '$lib/accounting/format'
  import { parseStatementCsv, autoMatch } from '$lib/accounting/statement-import'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const accountName = $derived(data.accounts.find((a) => a._id === data.accountId)?.name ?? data.accountId)
  const lastRec = $derived(data.history[0])

  // Ticked transactions, by entry id. Reset when the account changes.
  let checked = $state<Record<string, boolean>>({})
  // svelte-ignore state_referenced_locally
  $effect(() => { void data.accountId; checked = {} })

  const today = new Date().toISOString().slice(0, 10)
  let statementDate = $state(today)
  let statementBalanceStr = $state('')
  let saving = $state(false)
  let error = $state('')

  function toCents(s: string): number {
    const t = s.trim()
    if (!t) return NaN
    try { return parseMoney(t) } catch { return NaN }
  }

  let clearedTotal = $derived(data.uncleared.reduce((a, t) => a + (checked[t.entry_id] ? t.amount : 0), 0))
  let reconciledBalance = $derived(data.clearedBalance + clearedTotal)
  let stmtCents = $derived(toCents(statementBalanceStr))
  let difference = $derived(Number.isNaN(stmtCents) ? NaN : stmtCents - reconciledBalance)
  let balanced = $derived(!Number.isNaN(difference) && difference === 0)
  let checkedCount = $derived(data.uncleared.filter((t) => checked[t.entry_id]).length)

  function selectAccount(id: string) { goto(`/accounting/reconcile?account=${id}`) }

  // Optional: paste a bank-statement CSV to auto-tick the matching transactions.
  let csvText = $state('')
  let importMsg = $state('')
  function importStatement() {
    importMsg = ''
    try {
      const lines = parseStatementCsv(csvText)
      if (!lines.length) { importMsg = 'No transactions found — expected Date, Description, Amount columns.'; return }
      const res = autoMatch(lines, data.uncleared)
      for (const id of res.matchedTxnIds) checked[id] = true
      importMsg = `Matched ${res.matchedCount} of ${lines.length} statement line${lines.length === 1 ? '' : 's'}`
        + (res.unmatchedStatement.length ? ` · ${res.unmatchedStatement.length} unmatched (no uncleared entry with that amount)` : '')
    } catch (e) {
      importMsg = `Couldn't parse the CSV: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  async function finish() {
    saving = true
    error = ''
    try {
      const cleared_entry_ids = data.uncleared.filter((t) => checked[t.entry_id]).map((t) => t.entry_id)
      const r = await fetch('/api/accounting/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: data.accountId, statement_date: statementDate, statement_balance: statementBalanceStr, cleared_entry_ids }),
      })
      if (!r.ok) throw new Error(await r.text())
      checked = {}
      statementBalanceStr = ''
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Reconcile · Blueprint</title></svelte:head>

<AccountingShell {user} title="Bank Reconciliation" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Match the ledger to a bank statement' }]}>
  {#if data.accounts.length === 0}
    <section class="card flush"><p class="empty">No bank accounts in the chart of accounts.</p></section>
  {:else}
    <div class="toolbar">
      <label class="field">Account
        <select value={data.accountId} onchange={(e) => selectAccount(e.currentTarget.value)}>
          {#each data.accounts as a (a._id)}<option value={a._id}>{a.code} · {a.name}</option>{/each}
        </select>
      </label>
      <label class="field">Statement date<input type="date" bind:value={statementDate} /></label>
      <label class="field">Statement ending balance<input type="text" inputmode="decimal" bind:value={statementBalanceStr} placeholder="0.00" /></label>
    </div>

    <div class="summary">
      <div><span class="k">Book balance</span><span class="v mono">{usd(data.bookBalance)}</span></div>
      <div><span class="k">Beginning (cleared)</span><span class="v mono">{usd(data.clearedBalance)}</span></div>
      <div><span class="k">+ Cleared this statement</span><span class="v mono">{usd(clearedTotal)}</span></div>
      <div><span class="k">= Reconciled balance</span><span class="v mono">{usd(reconciledBalance)}</span></div>
      <div class="diff" class:ok={balanced} class:bad={!balanced && !Number.isNaN(difference)}>
        <span class="k">Difference</span>
        <span class="v mono">{Number.isNaN(difference) ? '—' : usd(difference)} {balanced ? '✓' : ''}</span>
      </div>
    </div>

    {#if data.uncleared.length}
      <details class="import-card">
        <summary><Icon name="import" size={13} /> Import a bank statement (CSV) to auto-tick matches</summary>
        <p class="import-hint">Paste your bank export — columns <code>Date</code>, <code>Description</code>, <code>Amount</code> (or Debit/Credit). Lines are matched to uncleared transactions by amount.</p>
        <textarea bind:value={csvText} rows="5" placeholder="Date,Description,Amount&#10;2026-06-09,Customer deposit,2000.00&#10;2026-06-10,Check 1099,-500.00"></textarea>
        <div class="import-actions">
          <button class="btn-secondary" type="button" onclick={importStatement} disabled={!csvText.trim()}>Import &amp; match</button>
          {#if importMsg}<span class="import-msg">{importMsg}</span>{/if}
        </div>
      </details>
    {/if}

    <section class="card">
      <div class="card-head">
        <h2>Uncleared transactions</h2>
        <span class="muted">{checkedCount} of {data.uncleared.length} ticked</span>
      </div>
      {#if data.uncleared.length === 0}
        <p class="empty">Nothing uncleared on this account. {lastRec ? `Last reconciled ${lastRec.statement_date}.` : ''}</p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead><tr><th class="chk"></th><th>Date</th><th>Description</th><th>Source</th><th class="num">Amount</th></tr></thead>
            <tbody>
              {#each data.uncleared as t (t.entry_id)}
                <tr class:ticked={checked[t.entry_id]} onclick={() => (checked[t.entry_id] = !checked[t.entry_id])}>
                  <td class="chk"><input type="checkbox" bind:checked={checked[t.entry_id]} onclick={(e) => e.stopPropagation()} /></td>
                  <td class="mono">{t.date}</td>
                  <td>{t.memo ?? '—'}</td>
                  <td><span class="chip">{t.source}</span></td>
                  <td class="num" class:neg={t.amount < 0}>{usd(t.amount)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="actions">
      <button class="btn-primary" type="button" onclick={finish} disabled={!balanced || saving || statementBalanceStr.trim() === ''}>
        {saving ? 'Saving…' : 'Finish reconciliation'}
      </button>
      {#if !balanced && !Number.isNaN(difference)}<span class="hint">Tick transactions until the difference is $0.00.</span>{/if}
    </div>

    {#if data.history.length}
      <section class="card">
        <div class="card-head"><h2>Reconciliation history — {accountName}</h2></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Statement date</th><th class="num">Ending balance</th><th class="num">Cleared</th><th class="num">Items</th></tr></thead>
            <tbody>
              {#each data.history as r (r._id)}
                <tr>
                  <td class="mono">{r.statement_date}</td>
                  <td class="num">{usd(r.statement_balance)}</td>
                  <td class="num">{usd(r.cleared_total)}</td>
                  <td class="num">{r.cleared_entry_ids.length}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {/if}
</AccountingShell>

<style>
  /* Reconcile-specific layout; shared chrome (card, table, buttons, chip) from accounting.css. */
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .summary > div { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--shadow); }
  .summary .k { font-size: 11px; color: var(--text-muted); font-weight: 600; }
  .summary .v { font-size: 16px; font-weight: 700; color: var(--text); }
  .summary .diff.ok { border-color: var(--success-border); background: var(--success-bg); }
  .summary .diff.ok .v { color: var(--success); }
  .summary .diff.bad { border-color: var(--warning-border); background: var(--warning-bg); }
  .summary .diff.bad .v { color: var(--warning); }

  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--bg); }
  tbody tr.ticked { background: var(--primary-bg); }
  .chk { width: 32px; }
  .num.neg { color: var(--warning); }

  .actions { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; }
  .hint { color: var(--text-muted); font-size: 13px; }

  .import-card { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; box-shadow: var(--shadow); }
  .import-card summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); }
  .import-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0; }
  .import-hint code { background: var(--bg); border: 1px solid var(--border-soft); border-radius: 4px; padding: 0 4px; font-size: 11px; }
  .import-card textarea { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; resize: vertical; }
  .import-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
  .import-msg { font-size: 13px; color: var(--text-body); }
</style>
