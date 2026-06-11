<script lang="ts">
  // The `?` keyboard-shortcuts overlay — a quick reference card, rendered once
  // in the root layout for signed-in users. `?` opens it from anywhere except
  // inside a text field; Esc or the backdrop closes it.
  import Icon from './Icon.svelte'
  import { shortcutsUI } from '$lib/shortcuts.svelte'
  import { trapFocus } from '$lib/actions/trapFocus'

  const GROUPS: { title: string; rows: [string[], string][] }[] = [
    {
      title: 'Anywhere',
      rows: [
        [['⌘', 'K'], 'Search & commands'],
        [['?'], 'This overlay'],
        [['Esc'], 'Close dialogs & menus'],
      ],
    },
    {
      title: 'Board',
      rows: [
        [['↑', '↓', '←', '→'], 'Move between cards'],
        [['Enter'], 'Open the focused card'],
        [['Enter'], 'Save a quick-add title'],
      ],
    },
    {
      title: 'Comments',
      rows: [
        [['⌘', 'Enter'], 'Post the comment'],
        [['@'], 'Mention a teammate'],
      ],
    },
  ]

  function isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e)) {
      e.preventDefault()
      shortcutsUI.open = !shortcutsUI.open
    } else if (e.key === 'Escape' && shortcutsUI.open) {
      e.preventDefault()
      shortcutsUI.open = false
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if shortcutsUI.open}
  <div class="sc-backdrop" onclick={() => (shortcutsUI.open = false)} role="presentation"></div>
  <div class="sc-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" use:trapFocus>
    <header class="sc-head">
      <h2><Icon name="checklist" size={15} /> Keyboard shortcuts</h2>
      <button class="ghost sc-close" onclick={() => (shortcutsUI.open = false)} aria-label="Close shortcuts">
        <Icon name="x" size={14} />
      </button>
    </header>
    <div class="sc-body">
      {#each GROUPS as group}
        <section>
          <h3>{group.title}</h3>
          {#each group.rows as [keys, what]}
            <div class="sc-row">
              <span class="sc-keys">
                {#each keys as k, i}{#if i > 0}<span class="sc-plus">·</span>{/if}<kbd>{k}</kbd>{/each}
              </span>
              <span class="sc-what">{what}</span>
            </div>
          {/each}
        </section>
      {/each}
    </div>
  </div>
{/if}

<style>
  .sc-backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    z-index: calc(var(--z-sheet) - 1);
  }
  .sc-modal {
    position: fixed;
    z-index: var(--z-sheet);
    top: 14vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(420px, calc(100vw - 24px));
    max-height: 70vh;
    overflow-y: auto;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
  }
  .sc-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
  }
  .sc-head h2 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-lg);
    font-weight: 700;
    color: var(--text);
  }
  .sc-close { color: var(--text-faint); padding: 4px 8px; }
  .sc-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 14px; }
  section h3 {
    font-size: var(--font-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 0 0 6px;
  }
  .sc-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }
  .sc-keys { display: inline-flex; align-items: center; gap: 4px; min-width: 96px; }
  .sc-plus { color: var(--text-faint); font-size: var(--font-xs); }
  kbd {
    font-family: inherit;
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--text-body);
    background: var(--bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    min-width: 22px;
    text-align: center;
  }
  .sc-what { font-size: var(--font-base); color: var(--text-body); }
</style>
