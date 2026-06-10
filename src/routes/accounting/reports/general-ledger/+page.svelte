<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import DateRange from '$lib/components/accounting/DateRange.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
</script>

<svelte:head><title>General Ledger · Blueprint</title></svelte:head>

<AccountingShell {user} title="General Ledger" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: 'General ledger' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href={`/api/accounting/export/general-ledger?from=${data.from}&to=${data.to}`}>⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">Every posting in the period, grouped by account with totals — the report your accountant reconciles against. {data.from} to {data.to}.</p>
  <DateRange from={data.from} to={data.to} base="/accounting/reports/general-ledger" />

  {#if data.groups.length === 0}
    <section class="card"><p class="empty">No postings in this period.</p></section>
  {:else}
    {#each data.groups as g (g.account_id)}
      <section class="card">
        <div class="card-head">
          <h2><a class="acct-link" href="/accounting/register/{g.account_id}">{g.account_id} · {g.name}</a></h2>
          <span class="muted">net {usd(g.net)}</span>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Memo</th><th>Source</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
          <tbody>
            {#each g.rows as r, i (g.account_id + i)}
              <tr>
                <td class="mono">{r.date}</td>
                <td>{r.memo ?? '—'}</td>
                <td><span class="chip">{r.source}</span></td>
                <td class="num">{r.debit > 0 ? usd(r.debit) : ''}</td>
                <td class="num">{r.credit > 0 ? usd(r.credit) : ''}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td></td><td>Total</td><td></td>
              <td class="num">{usd(g.totalDebit)}</td>
              <td class="num">{usd(g.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    {/each}
  {/if}
</AccountingShell>

<style>
  .acct-link { color: inherit; text-decoration: none; }
  .acct-link:hover { color: var(--primary-text); text-decoration: underline; }
</style>
