<script lang="ts">
  import { page } from '$app/state'
  import ThemeToggle from './ThemeToggle.svelte'
  import Icon from './Icon.svelte'
  import { openSearch } from '$lib/search.svelte'
  import type { IconName } from '$lib/icons'
  import type { Snippet } from 'svelte'

  // Shared navigation drawer used by every page (board, dashboard, quotes).
  // Desktop: a permanently-visible sidebar. Mobile: an off-canvas drawer opened
  // by each page's `☰` button (sets `open`), dimmed by a backdrop and closable
  // via the backdrop, the ✕, or navigating. `children` holds page-specific drawer
  // content (the board passes its stats + admin controls).
  let {
    open = $bindable(false),
    user,
    children,
  }: {
    open?: boolean
    user: { name: string; role: string }
    children?: Snippet
  } = $props()

  // Semantic glyph names from Blueprint's custom icon set ($lib/icons.ts); a
  // native client can map the same names to SF Symbols instead of the SVGs.
  const NAV: { href: string; icon: IconName; label: string }[] = [
    { href: '/', icon: 'board', label: 'Kanban Board' },
    { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/jobs', icon: 'scales', label: 'Job Cockpit' },
    { href: '/quotes', icon: 'quote', label: 'Quote Generator' },
    { href: '/accounting', icon: 'ledger', label: 'Accounting' },
    { href: '/infra', icon: 'spend', label: 'Infra Spend' },
    { href: '/prospects', icon: 'prospects', label: 'Prospects' },
    { href: '/competitive-landscape', icon: 'map', label: 'Competitive Landscape' },
    { href: '/design', icon: 'palette', label: 'Design System' },
  ]
  const isActive = (href: string) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  // Lock background scroll while the mobile drawer is open (mirrors NewTaskModal).
  // Only ever true on mobile — the ☰ button that sets it is hidden on desktop.
  $effect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  })
</script>

{#if open}
  <div class="sidebar-backdrop" onclick={() => (open = false)} role="presentation"></div>
{/if}

<aside class="sidebar" class:open>
  <div class="brand">
    <span class="brand-mark"><Icon name="logo" size={17} /></span>
    <span class="brand-name">Blueprint</span>
  </div>

  <div class="user-info">
    <div class="user-meta">
      <div class="user-name">{user.name}</div>
      <span class="role-badge">{user.role === 'admin' ? 'Admin' : 'PM'}</span>
    </div>
    <button class="sidebar-close" onclick={() => (open = false)} aria-label="Close menu"><Icon name="x" size={16} /></button>
  </div>

  <button class="nav-search" type="button" onclick={() => { openSearch(); open = false }}>
    <span class="nav-search-label"><Icon name="search" size={14} /> Search</span>
    <kbd>⌘K</kbd>
  </button>

  <a
    class="nav-help"
    href={user.role === 'admin' ? '/guides/admin-user-guide.pdf' : '/guides/pm-user-guide.pdf'}
    target="_blank"
    rel="noopener"
    onclick={() => (open = false)}
  >
    <Icon name="guide" size={14} /> Help &amp; Guide
  </a>

  <form action="/auth/signout" method="POST">
    <button class="secondary full-w" type="submit">Log out</button>
  </form>

  <ThemeToggle />

  {#if user.role === 'admin'}
    <hr />
    <nav class="nav-links">
      {#each NAV as item}
        <a
          href={item.href}
          class="nav-link"
          class:active={isActive(item.href)}
          aria-current={isActive(item.href) ? 'page' : undefined}
          onclick={() => (open = false)}
        >
          <span class="nav-icon" aria-hidden="true"><Icon name={item.icon} size={15} /></span>{item.label}
        </a>
      {/each}
    </nav>
  {/if}

  {#if children}
    <hr />
    {@render children()}
  {/if}
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width, 240px);
    background: var(--card-bg);
    border-right: 1px solid var(--border);
    padding: 14px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    height: 100vh;
    height: 100dvh;
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    z-index: calc(var(--z-drawer) - 1);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 2px 4px;
  }
  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
    color: #fff;
    flex-shrink: 0;
  }
  .brand-name {
    font-size: var(--font-lg);
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--text);
  }

  .user-info {
    padding: 4px 2px 6px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .user-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .user-name { font-size: var(--font-base); font-weight: 600; color: var(--text); }
  .role-badge {
    background: var(--chip-bg);
    color: var(--primary-text);
    border-radius: var(--radius-lg);
    padding: 1px 7px;
    font-size: var(--font-xs);
    font-weight: 600;
    align-self: flex-start;
  }
  /* Close button only appears in the mobile drawer (see media query). */
  .sidebar-close {
    display: none;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    font-size: var(--font-lg);
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .full-w { width: 100%; justify-content: center; }
  hr { border: none; border-top: 1px solid var(--border-soft); margin: 4px 0; }

  .nav-search {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    width: 100%;
    background: var(--bg); border: 1px solid var(--border); color: var(--text-muted);
    border-radius: var(--radius-md); padding: 7px 12px; font-size: var(--font-base); font-weight: 600; cursor: pointer;
  }
  .nav-search:hover { border-color: var(--primary); color: var(--primary-text); }
  .nav-search-label { display: inline-flex; align-items: center; gap: 8px; }

  .nav-help {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: var(--radius-md);
    padding: 7px 12px;
    font-size: var(--font-base);
    font-weight: 600;
    text-decoration: none;
  }
  .nav-help:hover { border-color: var(--primary); color: var(--primary-text); }
  .nav-search kbd {
    font-family: inherit; font-size: var(--font-xs); color: var(--text-faint);
    border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 5px; background: var(--card-bg);
  }

  .nav-links { display: flex; flex-direction: column; gap: 4px; }
  .nav-link {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    font-size: var(--font-base);
    font-weight: 500;
    color: var(--text-body);
    text-decoration: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    transition: background var(--speed), border-color var(--speed);
  }
  .nav-link:hover { background: var(--primary-bg); border-color: var(--primary-border); color: var(--primary-text); }
  /* Highlight the page you're on. */
  .nav-link.active {
    background: var(--primary-bg);
    border-color: var(--primary-border);
    color: var(--link);
    font-weight: 600;
  }
  /* Decorative leading glyph; kept out of the label text (see NAV). Muted by
     default, tints with the link on hover/active via currentColor. */
  .nav-icon { display: inline-flex; margin-right: 8px; color: var(--text-faint); }
  .nav-link:hover .nav-icon,
  .nav-link.active .nav-icon { color: inherit; }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: min(280px, 84vw);
      z-index: var(--z-drawer);
      /* Clear the notch and the home indicator. */
      padding-top: max(14px, env(safe-area-inset-top));
      padding-left: max(12px, env(safe-area-inset-left));
      padding-bottom: max(14px, env(safe-area-inset-bottom));
      box-shadow: var(--shadow-drawer);
      display: none;          /* hidden by default on mobile */
    }
    .sidebar.open { display: flex; }   /* shown when the menu button is tapped */
    .sidebar-close { display: inline-flex; }
    .nav-link { display: flex; align-items: center; min-height: 44px; }
  }
</style>
