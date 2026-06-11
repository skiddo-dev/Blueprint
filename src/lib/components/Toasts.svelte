<script lang="ts">
  // The global toast stack — rendered once in the root layout, fed by $lib/toast.
  // Bottom-center, above every other layer (--z-toast); errors interrupt the
  // screen reader (role="alert"), everything else queues politely.
  import Icon from './Icon.svelte'
  import type { IconName } from '$lib/icons'
  import { toasts, toast, type ToastKind } from '$lib/toast.svelte'

  const KIND_ICON: Record<ToastKind, IconName> = {
    success: 'check',
    info: 'bell',
    warning: 'warning',
    error: 'warning',
  }
</script>

{#if toasts.length}
  <div class="toast-region" aria-label="Notifications">
    {#each toasts as t (t.id)}
      <div class="toast {t.kind}" role={t.kind === 'error' ? 'alert' : 'status'}>
        <span class="toast-icon" aria-hidden="true"><Icon name={KIND_ICON[t.kind]} size={14} /></span>
        <span class="toast-msg">{t.message}</span>
        {#if t.undo}
          <button class="toast-undo" onclick={() => toast.undo(t.id)}>Undo</button>
        {/if}
        <button class="toast-x" onclick={() => toast.dismiss(t.id)} aria-label="Dismiss notification">
          <Icon name="x" size={12} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-region {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: max(16px, env(safe-area-inset-bottom));
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: min(480px, calc(100vw - 32px));
    /* Clicks pass through the empty region; the toasts themselves catch them. */
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    font-size: var(--font-base);
    font-weight: 500;
    border: 1px solid;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    animation: toast-in var(--speed) ease;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .toast.success { background: var(--success-bg); color: var(--success); border-color: var(--success-border); }
  .toast.info    { background: var(--info-bg);    color: var(--info);    border-color: var(--info-bg); }
  .toast.warning { background: var(--warning-bg); color: var(--warning); border-color: var(--warning-border); }
  .toast.error   { background: var(--danger-bg);  color: var(--danger);  border-color: var(--danger-border); }
  .toast-icon { display: inline-flex; flex: 0 0 auto; }
  .toast-msg { flex: 1; line-height: 1.4; }
  .toast-undo {
    flex: 0 0 auto;
    background: transparent;
    border: none;
    padding: 2px 4px;
    min-height: 0;
    font-size: var(--font-base);
    font-weight: 700;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .toast-x {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    background: transparent;
    border: none;
    padding: 2px;
    min-height: 0;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
  }
  .toast-x:hover { opacity: 1; }

  /* Tap targets on touch screens (the global 44px button floor is for page
     controls; toasts are transient, so just pad the hit area). */
  @media (max-width: 768px) {
    .toast-undo { padding: 8px 10px; }
    .toast-x { padding: 8px; }
  }
</style>
