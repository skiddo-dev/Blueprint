<script lang="ts">
  import '../app.css'
  import { initTheme } from '$lib/theme.svelte'
  import { onNavigate } from '$app/navigation'
  import { navigating } from '$app/state'
  import SearchPalette from '$lib/components/SearchPalette.svelte'
  import ShortcutsHelp from '$lib/components/ShortcutsHelp.svelte'
  import Toasts from '$lib/components/Toasts.svelte'
  import type { LayoutData } from './$types'

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

  // Sync the reactive theme store from storage on mount and track OS theme changes
  // while on 'system'. The boot script in app.html already set data-theme pre-paint.
  $effect(() => initTheme())

  // Cross-page crossfade — duration/curve live in app.css on the
  // ::view-transition pseudo-elements. Skipped where the API is missing and
  // under reduced motion (the CSS kill-switch can't reach these pseudo-elements).
  onNavigate((navigation) => {
    if (!document.startViewTransition) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve()
        await navigation.complete
      })
    })
  })

  // Server loads block navigation, so slow pages used to feel dead between
  // click and paint. Show an indeterminate top bar — but only once a nav has
  // taken 150ms, so fast hops never flash it.
  let navSlow = $state(false)
  $effect(() => {
    if (!navigating.to) {
      navSlow = false
      return
    }
    const timer = setTimeout(() => (navSlow = true), 150)
    return () => clearTimeout(timer)
  })
</script>

{#if navSlow}
  <div class="nav-progress" role="progressbar" aria-label="Loading page"></div>
{/if}

{@render children()}

<!-- Global ⌘K search/commands + ? shortcuts — only for signed-in users (absent on /login). -->
{#if data.session?.user}
  <SearchPalette />
  <ShortcutsHelp />
{/if}

<Toasts />

<style>
  .nav-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: var(--z-toast);
    overflow: hidden;
    background: var(--primary-bg);
  }
  .nav-progress::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 40%;
    background: linear-gradient(90deg, var(--primary-dark), var(--primary));
    border-radius: var(--radius-pill);
    /* Indeterminate sweep — attention timing, not an interaction speed token
       (same exemption as the flash keyframes). */
    animation: nav-sweep 1.1s ease-in-out infinite;
  }
  @keyframes nav-sweep {
    from { transform: translateX(-100%); }
    to   { transform: translateX(350%); }
  }
</style>
