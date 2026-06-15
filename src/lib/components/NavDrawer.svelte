<script lang="ts">
  import { page } from '$app/state'
  import ThemeToggle from './ThemeToggle.svelte'
  import Icon from './Icon.svelte'
  import { openSearch } from '$lib/search.svelte'
  import { sidebarUI, toggleSidebar } from '$lib/sidebar.svelte'
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

<aside class="sidebar" class:open class:collapsed={sidebarUI.collapsed}>
  <div class="brand">
    <span class="brand-mark"><Icon name="logo" size={17} /></span>
    <span class="brand-name">Blueprint</span>
    <!-- Collapses the sidebar to a slim rail on desktop; the same button expands
         it again. Hidden on mobile, where the ☰ top-bar drives the drawer. -->
    <button
      class="sidebar-collapse"
      onclick={toggleSidebar}
      aria-label={sidebarUI.collapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-expanded={!sidebarUI.collapsed}
      title={sidebarUI.collapsed ? 'Show sidebar' : 'Hide sidebar'}
    >
      <Icon name="sidebar" size={16} />
    </button>
  </div>

  <div class="user-info">
    <div class="user-meta">
      <div class="user-name">{user.name}</div>
      <span class="role-badge">{user.role === 'admin' ? 'Admin' : 'PM'}</span>
    </div>
    <button class="sidebar-close" onclick={() => (open = false)} aria-label="Close menu"><Icon name="x" size={16} /></button>
  </div>

  <button
    class="nav-search"
    type="button"
    onclick={() => { openSearch(); open = false }}
    title={sidebarUI.collapsed ? 'Search' : undefined}
  >
    <span class="nav-search-label"><Icon name="search" size={14} /> Search</span>
    <kbd>⌘K</kbd>
  </button>

  <a
    class="nav-help"
    href={user.role === 'admin' ? '/guides/admin-user-guide.pdf' : '/guides/pm-user-guide.pdf'}
    target="_blank"
    rel="noopener"
    title={sidebarUI.collapsed ? 'Help & Guide' : undefined}
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
          title={sidebarUI.collapsed ? item.label : undefined}
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

  /* "Hide sidebar" — sits at the end of the brand row. Desktop only; the mobile
     drawer is dismissed with the ✕ in the user row instead. */
  .sidebar-collapse {
    margin-left: auto;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--text-faint);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .sidebar-collapse:hover { border-color: var(--primary); color: var(--primary-text); }

  /* Desktop collapse → a slim icon rail: keep the toggle, search, help, theme and
     the nav glyphs (labels collapsed to nothing), drop the text-only rows so
     .main-content reclaims the width. Stays in the flex flow (no overlap), and is
     scoped to ≥769px so it never fights the mobile off-canvas drawer rules. */
  @media (min-width: 769px) {
    .sidebar.collapsed {
      width: 56px;
      padding: 14px 8px;
      align-items: stretch;
      gap: 6px;
      overflow-x: hidden;
    }

    /* Hide every row by default — board stats + ThemeToggle carry a foreign scope
       hash (snippet / child component), so a scoped :not() can't reach them, hence
       :global — then bring the icon chrome back below. */
    .sidebar.collapsed > :global(:not(.brand)) { display: none; }

    /* Brand row → just the toggle, centred. */
    .sidebar.collapsed .brand { padding: 0; gap: 0; justify-content: center; }
    .sidebar.collapsed .brand-mark,
    .sidebar.collapsed .brand-name { display: none; }
    .sidebar.collapsed .sidebar-collapse { margin: 0; }

    /* Icon-only chrome. font-size:0 collapses the bare-text labels (and the ⌘K
       hint) while the SVGs keep their fixed width/height — the labels stay in the
       a11y tree, and a `title` (set when collapsed) surfaces on hover.
       NOTE: keep the :global ThemeToggle rule on its own — mixing :global into a
       comma list corrupts the scope hash of its scoped siblings (they silently
       stop matching). */
    .sidebar.collapsed .nav-search,
    .sidebar.collapsed .nav-help {
      display: inline-flex;
      justify-content: center;
      gap: 0;
      padding: 9px 0;
      font-size: 0;
    }
    .sidebar.collapsed :global(.theme-toggle) {
      justify-content: center;
      gap: 0;
      padding: 9px 0;
      font-size: 0;
    }
    .sidebar.collapsed .nav-search-label { gap: 0; }
    .sidebar.collapsed .nav-search kbd { display: none; }
    .sidebar.collapsed :global(.tt-label) { gap: 0; }

    .sidebar.collapsed .nav-links { display: flex; }
    .sidebar.collapsed .nav-link {
      justify-content: center;
      padding: 9px 0;
      font-size: 0;
    }
    .sidebar.collapsed .nav-icon { margin-right: 0; }
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
    /* Collapse is a desktop affordance; the ☰ top bar drives the drawer here. */
    .sidebar-collapse { display: none; }
  }
</style>
