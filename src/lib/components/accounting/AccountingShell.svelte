<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { page } from '$app/state'
  import type { Snippet } from 'svelte'
  // Shared V2 styling for every accounting page. Imported here (once) so the
  // `.acct`-scoped rules apply wherever this shell wraps content.
  import '$lib/styles/accounting.css'

  // The accounting module's shell: PageShell (drawer + mobile topbar) plus a
  // consistent V2 header (title + breadcrumb + per-page actions) and the
  // persistent section nav that highlights the current route. Replaces the
  // per-page `head` snippet + the landing-only subnav.
  type Crumb = { label: string; href?: string }
  let {
    user,
    title,
    crumbs = [],
    maxWidth = '1320px',
    actions,
    children,
  }: {
    user: { name: string; role: string }
    title: string
    crumbs?: Crumb[]
    maxWidth?: string
    actions?: Snippet // per-page primary action(s), shown at the top-right (desktop)
    children: Snippet
  } = $props()

  const path = $derived(page.url.pathname)
  // Overview matches only the exact hub path; every other section also matches
  // its sub-routes (e.g. /accounting/invoices highlights on /…/invoices/new).
  function isActive(href: string): boolean {
    if (href === '/accounting') return path === href
    return path === href || path.startsWith(href + '/')
  }

  const NAV: { label: string; items: { href: string; ico: string; label: string }[] }[] = [
    { label: 'Overview', items: [{ href: '/accounting', ico: '📒', label: 'Overview' }] },
    { label: 'Receivables', items: [
      { href: '/accounting/invoices', ico: '📄', label: 'Invoices' },
      { href: '/accounting/customers', ico: '🤝', label: 'Customers' },
      { href: '/accounting/aging', ico: '📈', label: 'A/R Aging' },
    ] },
    { label: 'Payables', items: [
      { href: '/accounting/bills', ico: '🧾', label: 'Bills' },
      { href: '/accounting/vendors', ico: '🏗️', label: 'Vendors' },
      { href: '/accounting/ap-aging', ico: '📉', label: 'A/P Aging' },
    ] },
    { label: 'Reports', items: [
      { href: '/accounting/income-statement', ico: '📊', label: 'Income Statement' },
      { href: '/accounting/balance-sheet', ico: '🏦', label: 'Balance Sheet' },
      { href: '/accounting/cash-flow', ico: '💵', label: 'Cash Flow' },
    ] },
    { label: 'Banking', items: [
      { href: '/accounting/reconcile', ico: '✅', label: 'Reconcile' },
    ] },
  ]
</script>

<PageShell {user} {title} {maxWidth}>
  <div class="acct">
    <header class="acct-head">
      <div>
        <h1>{title}</h1>
        {#if crumbs.length}
          <p class="acct-crumbs">
            {#each crumbs as c, i (i)}
              {#if i > 0}<span class="sep">›</span>{/if}
              {#if c.href}<a href={c.href}>{c.label}</a>{:else}<span>{c.label}</span>{/if}
            {/each}
          </p>
        {/if}
      </div>
      {#if actions}<div class="acct-head-actions">{@render actions()}</div>{/if}
    </header>

    <nav class="acct-nav" aria-label="Accounting sections">
      {#each NAV as group (group.label)}
        <span class="group" role="group" aria-label={group.label}>
          {#each group.items as it (it.href)}
            <a href={it.href} class:active={isActive(it.href)} aria-current={isActive(it.href) ? 'page' : undefined}>
              <span class="ico">{it.ico}</span>{it.label}
            </a>
          {/each}
        </span>
      {/each}
    </nav>

    {@render children()}
  </div>
</PageShell>
