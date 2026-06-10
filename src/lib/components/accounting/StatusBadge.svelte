<script lang="ts">
  // Canonical invoice/bill status pill — one color map for the whole module
  // (previously duplicated in the invoices and bills lists). Uses a distinct
  // `.status-badge` class so it never collides with the shared `.acct .badge`.
  let { status }: { status: string } = $props()
</script>

<span class="status-badge {status}">{status}</span>

<style>
  .status-badge {
    font-size: 11px; font-weight: 600; border-radius: 8px; padding: 2px 8px; text-transform: capitalize; white-space: nowrap;
  }
  .status-badge.partial { background: var(--warning-bg); color: var(--warning); }
  .status-badge.paid { background: var(--success-bg); color: var(--success); }
  .status-badge.overdue { background: var(--danger-bg); color: var(--danger); }
  /* Open (info blue) and void (slate) have no semantic token; themed locally. */
  .status-badge.open { background: #dbeafe; color: #1d4ed8; }
  .status-badge.void { background: #f1f5f9; color: #475569; }
  :global(:root[data-theme='dark']) .status-badge.open { background: #1e3a5f; color: #93c5fd; }
  :global(:root[data-theme='dark']) .status-badge.void { background: #334155; color: #cbd5e1; }
</style>
