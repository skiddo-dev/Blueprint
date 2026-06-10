<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'
  // The page is a self-contained, blueprint-themed sheet — its own dark theme,
  // Google Fonts, an inline SVG radius plot and a render script. Imported as a
  // raw string and dropped into a sandboxed iframe via `srcdoc` so (a) its styles
  // stay fully isolated from the app's light shell, and (b) the markup never gets
  // its own public URL — it ships only inside this admin-gated page's payload.
  import reportHtml from '$lib/competitive-landscape.html?raw'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only (guarded
  // in hooks.server.ts and only listed in the nav for admins).
  // svelte-ignore state_referenced_locally
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }
</script>

<svelte:head><title>Competitive Landscape · Blueprint</title></svelte:head>

<PageShell {user} title="Competitive Landscape">
  <iframe
    class="report"
    title="Raves Construction — Competitive Landscape"
    srcdoc={reportHtml}
    sandbox="allow-scripts"
  ></iframe>
</PageShell>

<style>
  /* Fill the PageShell content column; the sheet scrolls inside the frame. */
  .report {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 70vh;
    border: none;
    border-radius: var(--radius-md);
    background: #0a2a66; /* blueprint field — avoids a white flash before load */
  }
</style>
