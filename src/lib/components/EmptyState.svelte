<script lang="ts">
  // The designed empty state — a hand-drawn icon, a headline, a line of help,
  // and the first action. For page-level "nothing here yet" moments (board,
  // dashboard, prospects, and the accounting module lists' first run); compact
  // one-line `.empty` placeholders stay the pattern for filtered-to-nothing
  // results, sub-sections, and printable reports by design.
  import Icon from './Icon.svelte'
  import type { IconName } from '$lib/icons'
  import type { Snippet } from 'svelte'

  let {
    icon,
    title,
    size = 'md',
    framed = true,
    children,
    actions,
  }: {
    icon: IconName
    title: string
    /** sm: inside palettes/cards · md: page-level */
    size?: 'sm' | 'md'
    /** dashed card framing; turn off when the host already provides a card */
    framed?: boolean
    children?: Snippet
    actions?: Snippet
  } = $props()
</script>

<div class="empty-state {size}" class:framed>
  <div class="es-icon" aria-hidden="true"><Icon name={icon} size={size === 'sm' ? 28 : 40} /></div>
  <h2 class="es-title">{title}</h2>
  {#if children}<p class="es-body">{@render children()}</p>{/if}
  {#if actions}<div class="es-actions">{@render actions()}</div>{/if}
</div>

<style>
  .empty-state {
    text-align: center;
    max-width: 460px;
    margin: 0 auto;
    padding: 32px 24px;
  }
  .empty-state.framed {
    background: var(--card-bg);
    border: 1px dashed var(--border);
    border-radius: var(--radius-xl);
  }
  .es-icon { color: var(--text-faint); margin-bottom: 8px; }
  .es-title { font-size: var(--font-xl); font-weight: 700; color: var(--text); margin: 0; }
  .es-body { font-size: var(--font-md); color: var(--text-muted); line-height: 1.5; margin: 8px 0 0; }
  .es-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 18px;
  }

  .empty-state.sm { padding: 20px 16px; }
  .empty-state.sm .es-title { font-size: var(--font-lg); }
  .empty-state.sm .es-body { font-size: var(--font-base); margin-top: 4px; }
  .empty-state.sm .es-actions { margin-top: 12px; }
</style>
