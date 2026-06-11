<script lang="ts">
  // The designed confirm() — a focus-trapped alertdialog rendered once in the
  // root layout; $lib/confirm.svelte.ts holds the pending ask. Esc and the
  // backdrop cancel. Danger asks focus Cancel first, so Enter never destroys.
  import Icon from './Icon.svelte'
  import { confirmUI, settleConfirm } from '$lib/confirm.svelte'
  import { trapFocus } from '$lib/actions/trapFocus'

  const pending = $derived(confirmUI.pending)

  function onKeydown(e: KeyboardEvent) {
    if (!confirmUI.pending || e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    settleConfirm(false)
  }
</script>

<svelte:window onkeydowncapture={onKeydown} />

{#if pending}
  <div class="cf-backdrop" onclick={() => settleConfirm(false)} role="presentation"></div>
  <div
    class="cf-modal"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="cf-title"
    aria-describedby={pending.body ? 'cf-body' : undefined}
    use:trapFocus
  >
    <h2 id="cf-title" class:danger={pending.danger}>
      {#if pending.danger}<span class="cf-glyph"><Icon name="warning" size={16} /></span>{/if}
      {pending.title}
    </h2>
    {#if pending.body}<p id="cf-body">{pending.body}</p>{/if}
    <div class="cf-actions">
      {#if pending.danger}
        <!-- svelte-ignore a11y_autofocus — initial dialog focus belongs on the safe action -->
        <button class="secondary" autofocus onclick={() => settleConfirm(false)}>{pending.cancelLabel ?? 'Cancel'}</button>
        <button class="cf-danger" onclick={() => settleConfirm(true)}>{pending.confirmLabel ?? 'Confirm'}</button>
      {:else}
        <button class="secondary" onclick={() => settleConfirm(false)}>{pending.cancelLabel ?? 'Cancel'}</button>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="primary" autofocus onclick={() => settleConfirm(true)}>{pending.confirmLabel ?? 'Confirm'}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .cf-backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    z-index: calc(var(--z-sheet) - 1);
  }
  .cf-modal {
    position: fixed;
    z-index: var(--z-sheet);
    top: 22vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(400px, calc(100vw - 24px));
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    padding: 18px 20px 16px;
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 8px;
    font-size: var(--font-lg);
    font-weight: 700;
    color: var(--text);
  }
  .cf-glyph { color: var(--danger); flex-shrink: 0; align-self: center; display: inline-flex; }
  p {
    margin: 0;
    font-size: var(--font-base);
    line-height: 1.5;
    color: var(--text-body);
  }
  .cf-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  /* Same destructive-outline language as the sheet's Delete and the void
     buttons — danger is ink here, never a solid fill, so it holds in dark. */
  .cf-danger {
    background: transparent;
    border: 1px solid var(--danger-border);
    color: var(--danger);
    border-radius: var(--radius-md);
    padding: 7px 14px;
    font-size: var(--font-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .cf-danger:hover { background: var(--danger-bg); }
</style>
