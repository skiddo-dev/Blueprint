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
  .status-badge.open { background: #dbeafe; color: #1d4ed8; }
  .status-badge.partial { background: #fef3c7; color: #b45309; }
  .status-badge.paid { background: #d1fae5; color: #047857; }
  .status-badge.void { background: #f1f5f9; color: #475569; }
  .status-badge.overdue { background: #fee2e2; color: #dc2626; }

  :global(:root[data-theme='dark']) .status-badge.open { background: #1e3a5f; color: #93c5fd; }
  :global(:root[data-theme='dark']) .status-badge.partial { background: #422006; color: #fcd34d; }
  :global(:root[data-theme='dark']) .status-badge.paid { background: #064e3b; color: #6ee7b7; }
  :global(:root[data-theme='dark']) .status-badge.void { background: #334155; color: #cbd5e1; }
  :global(:root[data-theme='dark']) .status-badge.overdue { background: #3f1d1d; color: #fca5a5; }
</style>
