<script lang="ts">
  // Loading placeholder for client-side fetches (server-loaded pages block
  // navigation instead — the nav progress bar covers those). Renders `lines`
  // shimmer bars; the last line is shortened so a text block reads as prose.
  // The shimmer collapses to a static fill under prefers-reduced-motion via
  // the global rule in app.css.
  let {
    lines = 1,
    height = '12px',
    width = '100%',
    radius = 'var(--radius-sm)',
  }: {
    lines?: number
    height?: string
    width?: string
    radius?: string
  } = $props()
</script>

<div class="skeleton" style:width aria-hidden="true">
  {#each { length: lines } as _, i}
    <span
      class="skeleton-bar"
      style:height
      style:border-radius={radius}
      style:width={lines > 1 && i === lines - 1 ? '60%' : '100%'}
    ></span>
  {/each}
</div>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .skeleton-bar {
    display: block;
    background: linear-gradient(
      90deg,
      var(--border-soft) 25%,
      var(--border) 45%,
      var(--border-soft) 65%
    );
    background-size: 200% 100%;
    /* Attention timing, like the flash keyframes — not an interaction speed. */
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-shimmer {
    from { background-position: 175% 0; }
    to   { background-position: -25% 0; }
  }
</style>
