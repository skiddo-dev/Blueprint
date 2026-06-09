# Blueprint Books — walkthrough screenshots

Captured 2026-06-09 from the deployed V3 UI against seeded demo books
(six months of activity; all figures internally consistent). 3000×1900 PNG
(2× scale) — crisp at deck size. For the sales deck, brief, and SOW.

| File | Shows |
| --- | --- |
| `01-overview.png` | Finance hub: KPI tiles with deltas + cash sparkline, revenue-vs-expenses chart, A/R & A/P aging |
| `02-invoices.png` | Invoice working list: status filter pills, search, "20d overdue" highlighting, payment progress, totals |
| `03-invoice-detail.png` | Partially-paid invoice: line items, payment history, record-payment form, PDF download |
| `04-income-statement.png` | Income statement with one-click periods (This month / Quarter / YTD) and Print |
| `05-balance-sheet.png` | Balance sheet with ✓ Balanced badge and as-of quick-picks |
| `06-cash-flow.png` | Statement of cash flows (operating / investing / financing) |
| `07-ar-aging.png` | A/R aging: bucketed chart over the open-invoice list |
| `08-reconcile.png` | Bank reconciliation: tick-to-zero workflow + CSV auto-match |
| `09-overview-dark.png` | The hub in dark mode |

Demo cast: Oakland Schools (overdue), Troy Community Center (partial-paid),
Beaumont Health (current); vendors Motor City Electric and Sound Productions.

To re-capture after UI changes: seed a throwaway local mongod through the
app's own APIs (see the accounting module notes), run the dev server with
`DEV_FAKE_AUTH=true`, and screenshot at 1500×950 @2× per page.
