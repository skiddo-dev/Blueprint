<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import DateRange from '$lib/components/accounting/DateRange.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
</script>

<svelte:head><title>Journal · Blueprint</title></svelte:head>

<AccountingShell {user} title="🧾 Journal" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: 'Journal' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href={`/api/accounting/export/journal?from=${data.from}&to=${data.to}`}>⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}>🖨 Print</button>
  {/snippet}

  <p class="report-hint">Every entry in date order with its full debit/credit detail — the audit trail itself. Reversals reference the entry they correct; nothing is ever edited in place. {data.from} to {data.to}.</p>
  <DateRange from={data.from} to={data.to} base="/accounting/reports/journal" />

  {#if data.entries.length === 0}
    <section class="card"><p class="empty">No entries in this period.</p></section>
  {:else}
    <section class="card">
      <table>
        <thead><tr><th>Date</th><th>Memo</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
        <tbody>
          {#each data.entries as e (e._id)}
            {#each e.lines as l, i (e._id + i)}
              <tr class:entry-start={i === 0}>
                <td class="mono">{i === 0 ? e.date : ''}</td>
                <td>
                  {#if i === 0}
                    {e.memo ?? '—'}
                    <span class="chip">{e.source}</span>
                    {#if e.reverses}<span class="tag">reversal</span>{/if}
                  {/if}
                </td>
                <td><a class="acct-cell" href="/accounting/register/{l.account_id}">{l.account_id} · {data.names[l.account_id] ?? ''}</a></td>
                <td class="num">{l.debit > 0 ? usd(l.debit) : ''}</td>
                <td class="num">{l.credit > 0 ? usd(l.credit) : ''}</td>
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</AccountingShell>

<style>
  tr.entry-start td { border-top: 2px solid var(--border); }
  .acct-cell { color: var(--text-body); text-decoration: none; font-size: 12.5px; }
  .acct-cell:hover { color: var(--primary-text); text-decoration: underline; }
</style>
