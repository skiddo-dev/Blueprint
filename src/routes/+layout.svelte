<script lang="ts">
  import '../app.css'
  import { initTheme } from '$lib/theme.svelte'
  import SearchPalette from '$lib/components/SearchPalette.svelte'
  import type { LayoutData } from './$types'

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

  // Sync the reactive theme store from storage on mount and track OS theme changes
  // while on 'system'. The boot script in app.html already set data-theme pre-paint.
  $effect(() => initTheme())
</script>

{@render children()}

<!-- Global ⌘K search — only for signed-in users (absent on /login). -->
{#if data.session?.user}
  <SearchPalette />
{/if}
