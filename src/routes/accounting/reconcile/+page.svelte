<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto, invalidateAll } from '$app/navigation'
  import { parseMoney } from '$lib/money'
  import { usd } from '$lib/accounting/format'
  import { parseStatementCsv, autoMatch, type StatementLine } from '$lib/accounting/statement-import'
  import type { LineSuggestion } from '$lib/accounting/categorize'
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

  // Unmatched statement lines, ready to be categorized + recorded in place.
  // The AI only ever fills the dropdown; "Record" posts through the normal
  // expense/journal endpoints and the new entry gets auto-ticked.
  type UnmatchedRow = {
    line: StatementLine
    account_id: string
    confidence: number | null
    recording: boolean
    error: string
  }
  let unmatchedRows = $state<UnmatchedRow[]>([])
  let aiBusy = $state(false)
  let aiMsg = $state('')

  function importStatement() {
    importMsg = ''
    aiMsg = ''
    try {
      const lines = parseStatementCsv(csvText)
      if (!lines.length) { importMsg = 'No transactions found — expected Date, Description, Amount columns.'; return }
      const res = autoMatch(lines, data.uncleared)
      for (const id of res.matchedTxnIds) checked[id] = true
      unmatchedRows = res.unmatchedStatement.map((line) => ({
        line, account_id: '', confidence: null, recording: false, error: '',
      }))
      importMsg = `Matched ${res.matchedCount} of ${lines.length} statement line${lines.length === 1 ? '' : 's'}`
        + (res.unmatchedStatement.length ? ` · ${res.unmatchedStatement.length} unmatched (no uncleared entry with that amount)` : '')
    } catch (e) {
      importMsg = `Couldn't parse the CSV: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  async function suggestCategories() {
    aiBusy = true
    aiMsg = ''
    try {
      const r = await fetch('/api/accounting/categorize-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: unmatchedRows.map((u) => ({ date: u.line.date, description: u.line.description, amount: u.line.amount })),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const { configured, suggestions } = (await r.json()) as { configured: boolean; suggestions: LineSuggestion[] }
      if (!configured) { aiMsg = 'AI suggestions aren’t configured on this server (OPENAI_API_KEY).'; return }
      let filled = 0
      for (const s of suggestions) {
        const row = unmatchedRows[s.index]
        if (!row || !s.account_id) continue
        row.account_id = s.account_id
        row.confidence = s.confidence
        filled++
      }
      aiMsg = filled
        ? `Suggested accounts for ${filled} of ${unmatchedRows.length} line${unmatchedRows.length === 1 ? '' : 's'} — review, then record.`
        : 'No confident suggestions — pick the accounts by hand.'
    } catch (e) {
      aiMsg = e instanceof Error ? e.message : String(e)
    } finally {
      aiBusy = false
    }
  }

  // Record one unmatched line: money OUT posts a quick expense, money IN posts
  // a deposit journal entry (Dr bank / Cr income). The new entry is ticked
  // immediately so the reconciliation difference closes as you go.
  async function recordRow(i: number) {
    const row = unmatchedRows[i]
    if (!row || !row.account_id) return
    row.recording = true
    row.error = ''
    const dollars = (Math.abs(row.line.amount) / 100).toFixed(2)
    try {
      let r: Response
      if (row.line.amount < 0) {
        r = await fetch('/api/accounting/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: row.line.date,
            payee: row.line.description,
            account_id: row.account_id,
            paid_from: data.accountId,
            amount: dollars,
          }),
        })
      } else {
        r = await fetch('/api/accounting/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: row.line.date,
            memo: row.line.description,
            lines: [
              { account_id: data.accountId, debit: dollars, credit: '' },
              { account_id: row.account_id, debit: '', credit: dollars },
            ],
          }),
        })
      }
      if (!r.ok) throw new Error(await r.text())
      const entry = await r.json()
      if (entry?._id) checked[entry._id] = true
      unmatchedRows = unmatchedRows.filter((_, j) => j !== i)
      await invalidateAll()
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e)
    } finally {
      row.recording = false
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

    {#if unmatchedRows.length}
      <section class="card">
        <div class="card-head">
          <h2>Unmatched statement lines</h2>
          <button class="btn-secondary" type="button" onclick={suggestCategories} disabled={aiBusy || !data.ai}
            title={data.ai ? 'Suggest an account for each line from your chart of accounts and payee history' : 'Set OPENAI_API_KEY to enable AI suggestions'}>
            <Icon name="spark" size={13} /> {aiBusy ? 'Suggesting…' : 'Suggest categories'}
          </button>
        </div>
        <p class="report-hint">These statement lines aren’t in the books yet. Pick an account (or let AI suggest one), then record — money out posts an expense, money in posts a deposit, and the new entry ticks itself.</p>
        {#if aiMsg}<p class="ai-msg">{aiMsg}</p>{/if}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Account</th><th></th></tr></thead>
            <tbody>
              {#each unmatchedRows as row, i (row.line.date + row.line.description + row.line.amount + i)}
                <tr>
                  <td class="mono">{row.line.date}</td>
                  <td>{row.line.description || '—'}</td>
                  <td class="num" class:neg={row.line.amount < 0}>{usd(row.line.amount)}</td>
                  <td class="acct">
                    <select bind:value={row.account_id} aria-label="Account for this line">
                      <option value="" disabled>Select account…</option>
                      {#each row.line.amount < 0 ? data.category.expense : data.category.income as a (a._id)}
                        <option value={a._id}>{a.code} · {a.name}</option>
                      {/each}
                    </select>
                    {#if row.confidence !== null && row.account_id}
                      <span class="chip ai-chip" title="AI suggestion — confirm before recording">AI {Math.round(row.confidence * 100)}%</span>
                    {/if}
                  </td>
                  <td class="rec">
                    <button class="btn-secondary" type="button" onclick={() => recordRow(i)} disabled={!row.account_id || row.recording}>
                      {row.recording ? 'Posting…' : row.line.amount < 0 ? 'Record expense' : 'Record deposit'}
                    </button>
                    {#if row.error}<span class="error">{row.error}</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
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
  .summary > div { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--shadow); }
  .summary .k { font-size: var(--font-xs); color: var(--text-muted); font-weight: 600; }
  .summary .v { font-size: var(--font-lg); font-weight: 700; color: var(--text); }
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
  .hint { color: var(--text-muted); font-size: var(--font-base); }

  .import-card { background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 12px 16px; margin-bottom: 16px; box-shadow: var(--shadow); }
  .import-card summary { cursor: pointer; font-size: var(--font-base); font-weight: 600; color: var(--text); }
  .import-hint { font-size: var(--font-sm); color: var(--text-muted); margin: 8px 0; }
  .import-hint code { background: var(--bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 0 4px; font-size: var(--font-xs); }
  .import-card textarea { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--font-sm); resize: vertical; }
  .import-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
  .import-msg { font-size: var(--font-base); color: var(--text-body); }

  .ai-msg { font-size: var(--font-base); color: var(--text-body); margin: 0 0 10px; }
  .acct { display: flex; align-items: center; gap: 8px; }
  .acct select { min-width: 200px; }
  .ai-chip { color: var(--primary-text); border-color: var(--primary); white-space: nowrap; }
  .rec { white-space: nowrap; }
  .rec .error { display: block; margin-top: 4px; }
</style>
