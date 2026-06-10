<script lang="ts">
  import { ICONS, type IconName } from '$lib/icons'

  // One glyph from Blueprint's custom icon set ($lib/icons.ts). Strokes inherit
  // `currentColor`, so icons tint with the surrounding text / hover state.
  // Decorative by default; pass `label` only when the icon stands alone.
  let {
    name,
    size = 18,
    label,
  }: { name: IconName; size?: number; label?: string } = $props()
</script>

<svg
  class="bp-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : true}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- static markup from $lib/icons.ts only -->
  {@html ICONS[name]}
</svg>

<style>
  /* Sits on the text baseline when used inline (e.g. inside a <summary>). */
  .bp-icon { flex-shrink: 0; vertical-align: -0.18em; }
</style>
