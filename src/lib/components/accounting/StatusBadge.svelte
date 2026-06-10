<script lang="ts">
  // Canonical invoice/bill status pill — one color map for the whole module
  // (previously duplicated in the invoices and bills lists). Uses a distinct
  // `.status-badge` class so it never collides with the shared `.acct .badge`.
  let { status }: { status: string } = $props()
</script>

<span class="status-badge {status}">{status}</span>

<style>
  .status-badge {
    font-size: var(--font-xs); font-weight: 600; border-radius: var(--radius-md); padding: 2px 8px; text-transform: capitalize; white-space: nowrap;
  }
  .status-badge.partial { background: var(--warning-bg); color: var(--warning); }
  .status-badge.paid { background: var(--success-bg); color: var(--success); }
  .status-badge.overdue { background: var(--danger-bg); color: var(--danger); }
  .status-badge.open { background: var(--info-bg); color: var(--info); }
  .status-badge.void { background: var(--border-soft); color: var(--text-soft); }
</style>
