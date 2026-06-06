<script lang="ts">
  import { page } from '$app/state'
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

  // Icon is kept separate from the label (not baked into the string) so a native
  // client can map each route to an SF Symbol while the web renders the emoji.
  const NAV = [
    { href: '/', icon: '🏗️', label: 'Kanban Board' },
    { href: '/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '/quotes', icon: '💰', label: 'Quote Generator' },
    { href: '/prospects', icon: '🏭', label: 'Prospects' },
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
  <div class="user-info">
    <div class="user-meta">
      <div class="user-name">{user.name}</div>
      <span class="role-badge">{user.role === 'admin' ? 'Admin' : 'PM'}</span>
    </div>
    <button class="sidebar-close" onclick={() => (open = false)} aria-label="Close menu">✕</button>
  </div>

  <form action="/auth/signout" method="POST">
    <button class="secondary full-w" type="submit">Log out</button>
  </form>

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
          <span class="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
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
    background: #ffffff;
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
    background: rgba(15, 23, 42, 0.4);
    z-index: 39; /* just under the drawer (40) */
  }

  .user-info {
    padding: 4px 2px 6px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .user-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .user-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .role-badge {
    background: #e0e7ff;
    color: var(--primary-text);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
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
    font-size: 15px;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 9px;
  }

  .full-w { width: 100%; justify-content: center; }
  hr { border: none; border-top: 1px solid var(--border-soft); margin: 4px 0; }

  .nav-links { display: flex; flex-direction: column; gap: 4px; }
  .nav-link {
    display: block;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-body);
    text-decoration: none;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    transition: background 0.15s, border-color 0.15s;
  }
  .nav-link:hover { background: var(--primary-bg); border-color: #c7d2fe; color: var(--primary-text); }
  /* Highlight the page you're on. */
  .nav-link.active {
    background: var(--primary-bg);
    border-color: #c7d2fe;
    color: var(--primary-dark);
    font-weight: 600;
  }
  /* Decorative leading glyph; kept out of the label text (see NAV). */
  .nav-icon { margin-right: 8px; }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: min(280px, 84vw);
      z-index: 40;
      /* Clear the notch and the home indicator. */
      padding-top: max(14px, env(safe-area-inset-top));
      padding-left: max(12px, env(safe-area-inset-left));
      padding-bottom: max(14px, env(safe-area-inset-bottom));
      box-shadow: 4px 0 20px rgba(15, 23, 42, 0.12);
      display: none;          /* hidden by default on mobile */
    }
    .sidebar.open { display: flex; }   /* shown when the menu button is tapped */
    .sidebar-close { display: inline-flex; }
    .nav-link { display: flex; align-items: center; min-height: 44px; }
  }
</style>
