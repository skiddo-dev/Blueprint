<script lang="ts">
  // Canonical status pill for the whole module — invoices/bills (open/partial/
  // paid/overdue/void), POs (open/partially-billed/closed/cancelled), and
  // deposits (posted/void). One color map; uses a distinct `.status-badge`
  // class so it never collides with the shared `.acct .badge`.
  let { status }: { status: string } = $props()
  // Normalize defensively — a Title-Cased API value would otherwise silently unstyle.
  const s = $derived(status.toLowerCase())
</script>

<span class="status-badge {s}">{s.replace(/-/g, ' ')}</span>

<style>
  .status-badge {
    font-size: var(--font-xs); font-weight: 600; border-radius: var(--radius-md); padding: 2px 8px; text-transform: capitalize; white-space: nowrap;
  }
  .status-badge.partial { background: var(--warning-bg); color: var(--warning); }
  .status-badge.paid { background: var(--success-bg); color: var(--success); }
  .status-badge.overdue { background: var(--danger-bg); color: var(--danger); }
  .status-badge.open { background: var(--info-bg); color: var(--info); }
  .status-badge.void { background: var(--border-soft); color: var(--text-soft); }
  /* PO lifecycle — same vocabulary: in-flight=amber, settled=green, dead=gray. */
  .status-badge.partially-billed { background: var(--warning-bg); color: var(--warning); }
  .status-badge.closed { background: var(--success-bg); color: var(--success); }
  .status-badge.cancelled { background: var(--border-soft); color: var(--text-soft); }
  /* Deposits */
  .status-badge.posted { background: var(--success-bg); color: var(--success); }
</style>
