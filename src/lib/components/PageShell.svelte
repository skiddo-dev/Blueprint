<script lang="ts">
  import NavDrawer from './NavDrawer.svelte'
  import type { Snippet } from 'svelte'

  // Shared shell for the admin routes (dashboard / quotes / prospects): the
  // off-canvas NavDrawer, the internally-scrolling content column, and the
  // mobile top bar (☰ + page title). Owns the `open` state for the drawer.
  //
  // The Kanban board deliberately keeps its own shell — its drawer carries
  // board stats (Sidebar) and its top bar carries the column switcher.
  let {
    user,
    title,
    maxWidth,
    head,
    children,
  }: {
    user: { name: string; role: string }
    title: string // shown in the mobile top bar (the desktop heading is `head`)
    maxWidth?: string // optional cap on the content column, e.g. '720px'
    head?: Snippet // desktop-only page heading (hidden on mobile)
    children: Snippet
  } = $props()

  let open = $state(false)
</script>

<div class="app-layout">
  <NavDrawer bind:open {user} />

  <main class="main-content" style:max-width={maxWidth ?? null}>
    <!-- Mobile-only: ☰ opens the drawer; the title stands in for the desktop heading. -->
    <div class="mobile-topbar">
      <button class="menu-btn" onclick={() => (open = true)} aria-label="Open menu">☰</button>
      <span class="topbar-title">{title}</span>
    </div>

    {#if head}
      <div class="page-head">{@render head()}</div>
    {/if}

    {@render children()}
  </main>
</div>

<style>
  /* Fixed shell + internally-scrolling content. The sticky .mobile-topbar
     (styled globally in app.css) pins to the top of this scroll container. */
  .app-layout {
    display: flex;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }
  .main-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    padding: 1.2rem 1.4rem;
  }
  /* Desktop heading; on mobile the .mobile-topbar carries the title instead. */
  .page-head {
    display: block;
  }

  @media (max-width: 768px) {
    .page-head {
      display: none;
    }
    /* No top padding so the sticky top bar pins flush (notch-safe); pad the
       remaining edges for the safe-area insets. */
    .main-content {
      padding-top: 0;
      padding-left: max(0.5rem, env(safe-area-inset-left));
      padding-right: max(0.5rem, env(safe-area-inset-right));
      padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
    }
  }
</style>
