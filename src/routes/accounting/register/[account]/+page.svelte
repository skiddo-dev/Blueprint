<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import DateRange from '$lib/components/accounting/DateRange.svelte'
  import { usd } from '$lib/accounting/format'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const account = $derived(data.account)
  const reg = $derived(data.register)

  // Source documents the register can drill into (payments reference their own
  // ids, not the parent doc, so they stay plain chips).
  const docHref = (source: string, ref?: string) =>
    ref && source === 'invoice' ? `/accounting/invoices/${ref}`
    : ref && source === 'bill' ? `/accounting/bills/${ref}`
    : null

  function pickAccount(id: string) {
    const q = new URLSearchParams()
    if (data.from) q.set('from', data.from)
    if (data.to) q.set('to', data.to)
    goto(`/accounting/register/${id}${q.size ? `?${q}` : ''}`)
  }
</script>

<svelte:head><title>Register · {account.name} · Blueprint</title></svelte:head>

<AccountingShell {user} title="Account register" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Register' }, { label: `${account.code} · ${account.name}` }]}>
  <p class="report-hint">Every transaction that touched this account, oldest first, with a running balance — like a checkbook for any line on the chart of accounts.</p>

  <div class="toolbar">
    <label class="field">Account
      <select value={account._id} onchange={(e) => pickAccount(e.currentTarget.value)}>
        {#each data.accounts as a (a._id)}
          <option value={a._id}>{a.code} · {a.name}</option>
        {/each}
      </select>
    </label>
    <a class="btn-secondary" href={`/api/accounting/export/register/${account._id}?from=${data.from}&to=${data.to}`}>⬇ CSV</a>
  </div>
  <DateRange from={data.from} to={data.to} base={`/accounting/register/${account._id}`} />

  <section class="card flush">
    {#if reg.rows.length === 0}
      <p class="empty">No activity on this account{data.from ? ' in this window' : ''} yet.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Memo</th><th>Source</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>
          </thead>
          <tbody>
            {#if data.from}
              <tr class="opening">
                <td class="mono">{data.from}</td>
                <td>Opening balance</td>
                <td></td><td class="num"></td><td class="num"></td>
                <td class="num">{usd(data.opening)}</td>
              </tr>
            {/if}
            {#each reg.rows as r (r.entry_id)}
              <tr>
                <td class="mono">{r.date}</td>
                <td>{r.memo ?? '—'}</td>
                <td>
                  {#if docHref(r.source, r.source_ref)}
                    <a class="chip" href={docHref(r.source, r.source_ref)}>{r.source}</a>
                  {:else}
                    <span class="chip">{r.source}</span>
                  {/if}
                </td>
                <td class="num">{r.debit > 0 ? usd(r.debit) : ''}</td>
                <td class="num">{r.credit > 0 ? usd(r.credit) : ''}</td>
                <td class="num">{usd(r.balance)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td></td><td>Closing balance</td><td></td><td></td><td></td>
              <td class="num">{usd(reg.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>

<style>
  tr.opening td { color: var(--text-muted); font-style: italic; }
  a.chip { text-decoration: none; }
  a.chip:hover { filter: brightness(0.95); }
</style>
