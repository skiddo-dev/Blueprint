<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import type { IconName } from '$lib/icons'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import AskTheBooks from '$lib/components/accounting/AskTheBooks.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const REPORTS: { href: string; ico: IconName; name: string; blurb: string }[] = [
    { href: '/accounting/reports/month-end', ico: 'spark', name: 'Month-end review', blurb: 'The month in plain English — key figures, biggest costs, and review flags before you close.' },
    { href: '/accounting/income-statement', ico: 'reports', name: 'Income statement', blurb: 'Revenue − costs = net income for any period (P&L).' },
    { href: '/accounting/balance-sheet', ico: 'scales', name: 'Balance sheet', blurb: 'What the business owns vs owes on a date.' },
    { href: '/accounting/cash-flow', ico: 'spend', name: 'Cash flow', blurb: 'Where cash actually moved: operating, investing, financing.' },
    { href: '/accounting/reports/pnl-monthly', ico: 'calendar', name: 'P&L by month', blurb: 'The comparative view — one column per month, the way accountants read a year.' },
    { href: '/accounting/reports/jobs', ico: 'vendors', name: 'Job profitability', blurb: 'Profit and margin per job — revenue vs bills and job-tagged expenses.' },
    { href: '/accounting/reports/general-ledger', ico: 'ledger', name: 'General ledger', blurb: 'Every posting grouped by account with period totals.' },
    { href: '/accounting/reports/journal', ico: 'list', name: 'Journal', blurb: 'Every entry in date order with its debits and credits.' },
    { href: '/accounting/reports/1099', ico: 'po', name: '1099 payments', blurb: 'Cash paid per 1099 vendor for the year — who needs a form in January.' },
    { href: '/accounting/reports/budget-vs-actual', ico: 'budget', name: 'Budget vs actual', blurb: 'How the year tracks against the plan, account by account.' },
  ]
</script>

<svelte:head><title>Reports · Blueprint</title></svelte:head>

<AccountingShell {user} title="Reports" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports' }]}>
  <p class="report-hint">Financial statements plus the working reports your accountant asks for at tax time. Every report prints clean.</p>

  <AskTheBooks ai={data.ai} />

  <div class="report-grid">
    {#each REPORTS as r (r.href)}
      <a class="report-card" href={r.href}>
        <span class="ico" aria-hidden="true"><Icon name={r.ico} size={22} /></span>
        <span class="body">
          <span class="name">{r.name}</span>
          <span class="blurb">{r.blurb}</span>
        </span>
      </a>
    {/each}
  </div>
</AccountingShell>

<style>
  .report-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  .report-card {
    display: flex; gap: 14px; align-items: flex-start; text-decoration: none;
    background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg);
    padding: 16px 18px; box-shadow: var(--shadow); transition: box-shadow 0.12s, transform 0.12s;
  }
  .report-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-1px); }
  .ico { display: inline-flex; color: var(--primary); margin-top: 1px; }
  .body { display: flex; flex-direction: column; gap: 4px; }
  .name { font-size: var(--font-lg); font-weight: 700; color: var(--text); }
  .blurb { font-size: var(--font-base); color: var(--text-muted); line-height: 1.45; }
</style>
