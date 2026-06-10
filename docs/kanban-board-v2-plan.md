# Kanban Board V2.0 — Plan

**Status: PROPOSED** (not started). The board is Blueprint's marquee feature; V2 is about making it
feel like a finished product in demos and in daily PM use, while fixing the structural gaps V1
accumulated.

---

## Where V1 stands

What shipped through PR #152: six fixed statuses, drag-and-drop via card handle, My Work / All
views keyed on login identity, single store-tag filter, 2s signature polling with offline
detection and optimistic writes, comments (@mentions, replies, reactions), attachments with
retention, multi-assignee, created-date chip, email-sync timeline, quote chip with pipeline
status, mobile one-column pill switcher, ⌘K deep links.

### The gaps V2 exists to close

1. **Drag order doesn't stick.** `getTasks` sorts `created_at: -1` (db.ts:336) and a drop only
   persists `status` (`handleMoved` in KanbanBoard.svelte). Reordering inside a column is
   cosmetic — the next poll that sees any server change re-groups and the order snaps back.
   Users notice this; it reads as a bug.
2. **Cards do everything inline.** TaskCard.svelte is 1,153 lines: full email body, notes,
   attachments, comment threads, quote editor — all crammed into a 240px column via an accordion.
   Reading an email or a comment thread in that width is painful, and every task on the board
   renders the full card even when CSS-hidden (KanbanColumn renders all items with a `hidden`
   prop). This was flagged in the iOS UI-prep pass as item #7 (compact card + detail sheet) and
   deferred.
3. **The board only grows.** Nothing archives. Done/Cancelled cards pile up forever, which
   degrades both scanning and DOM weight (compounds with gap 2).
4. **Filtering is thin.** My Work/All plus one store tag. No assignee, due-window, quote-status,
   source, or text filters; no way to combine them; no grouping.
5. **No flow signals.** Nothing surfaces "this card has sat in Review for two weeks" or "In
   Progress is overloaded." For a tool sold on operational visibility, the board is silent about
   flow health.
6. **Full refetch on every change.** The 2s poll replaces all columns wholesale when the
   signature changes. With rank unpersisted this is what destroys order; even after ranks land,
   merge-instead-of-replace plus a "changed" flash would make multi-user editing feel alive.

---

## V2.0 pillars

### A. Compact card + detail sheet (the marquee UX change)

Card face shrinks to a scannable summary: status color bar, title, store tags, PO chip, assignee
chips, due chip (overdue red), created chip, quote badge, and count chips (💬 3 · 📎 2 · ☑ 2/5).
Clicking a card opens a **detail sheet** — right-side panel on desktop (~480px), full-screen
sheet on mobile — containing everything currently inline: full email, editable fields, notes,
attachments, comment threads, timeline, quote editor, co-assignee management, checklist.

- Finishes deferred UI-prep item #7 and matches the iOS app's card → detail-sheet model exactly.
- Decomposes the TaskCard monolith: `CardFace.svelte` + `CardDetailSheet.svelte` +
  `CommentsThread.svelte`, `AttachmentsPanel.svelte`, `QuotePanel.svelte`. The accordion panels
  die; the handlers in KanbanBoard stay as-is (same callbacks, new layout).
- Deep links extend naturally: `/?task=<id>` opens the sheet instead of just flashing the card.
- Big DOM win: the board renders light card faces only; one sheet mounts at a time.

### B. Ordering that sticks (rank)

- New task field `rank: string` (fractional index — lexicographic midpoint strings, LexoRank
  style). Index `{status: 1, rank: 1}`; `getTasks` sorts by rank within status, `created_at`
  fallback for unranked docs.
- Drop persists `{status, rank}` in one write (new `POST /api/tasks/[id]/move`, since the PATCH
  contract is single-field). Reorder within a column persists rank alone.
- New cards and email-synced cards rank to the top of their column. Migration backfills rank
  from the current `created_at` order so nothing visibly moves on rollout.
- Fixes gap 1 outright and makes the poll's full refetch harmless to ordering.

### C. Filter bar + board lenses

A slim filter row above the columns, replacing the one-off store-filter bar:

- **Filters (composable):** assignee (multi), store # (multi — generalizes the tag toggle), due
  (overdue / this week / no date), quote status, source (email vs manual), free text over
  title/description. Active filters render as removable chips; column counts reflect the result.
- Composes with My Work/All; persisted per browser like the view toggle.
- **Lenses (stretch, possibly v2.1):** "Group by store" / "Group by assignee" swimlanes — rows of
  store lanes crossing the status columns. This is the construction-shaped demo (all of store
  #432's work across stages at a glance) but multiplies dnd zones (lane × status), so it ships
  after the core bar, possibly with drag disabled inside lanes initially (status dropdown still
  works).

### D. Flow signals + archive

- **Time-in-column:** stamp `status_changed_at` on every status transition (server-side, both
  PATCH paths + move endpoint + email-sync rules). Card face shows an aging chip past
  thresholds (e.g. ⏳ amber at 7d, red at 14d in a non-terminal column).
- **WIP soft limits:** per-status limits in constants.ts (re-served via `/api/config` per the
  existing config contract); column header shows `7/5` and turns amber when over. Soft only — no
  drop blocking.
- **Auto-archive:** `archived_at` on tasks; a lazy server-side sweep (throttled via the `meta`
  collection, e.g. hourly on GET /api/tasks) archives Done/Cancelled where
  `status_changed_at` > 30 days. `getTasks` excludes archived by default;
  `GET /api/tasks?archived=1` + a "Show archived" filter chip expose them; global search still
  finds them; unarchive = drag/status change. Keeps the board permanently light (gap 3).

### E. Working-speed features

- **Quick-add per column:** inline "+ Add" at the top of each column — type a title, Enter,
  done; opens in that status, ranked at top. (NewTaskModal stays for the full form.)
- **Bulk actions:** multi-select card faces (checkbox on hover / long-press on mobile) → action
  bar: move to status, assign, archive, delete. Mostly an admin/cleanup tool.
- **Checklists:** `checklist: [{id, text, done, done_by, done_at}]` on a task; editor in the
  detail sheet, `☑ 2/5` progress chip on the card face. Punch-list-shaped for construction.
  Endpoints: `POST/PATCH/DELETE /api/tasks/[id]/checklist[/itemId]`.
- **Keyboard basics:** Enter/Escape open/close the sheet, arrow navigation between cards;
  svelte-dnd-action's built-in keyboard drag remains for moves.

### F. Smarter sync (polish, after B makes it safe)

- Merge poll results into local state instead of replacing columns: update changed tasks in
  place (by `updated_at`), add/remove as needed, briefly flash cards another user just changed
  (reuse the search-flash treatment).
- Optional later: `GET /api/tasks?since=` delta endpoint. With rank persisted and client-side
  merge, full refetch is mostly fine — don't build delta until payload size actually hurts.

### iOS parity track

Every pillar is API-first so the SwiftUI app can follow. Parity wave (separate from web PRs):
co-assignees (already a known gap from PR #152), rank-respecting order + drag persistence,
detail-sheet additions (checklist, aging chip), basic filter row. WIP/aging thresholds come from
`/api/config` so iOS doesn't hand-copy them (existing config contract).

---

## Data model & API changes (summary)

| Change | Where |
|---|---|
| `rank: string`, `status_changed_at`, `archived_at?`, `checklist?[]` on Task | types.ts, db.ts, normalizeTask |
| Index `{status:1, rank:1}`; rank backfill migration | db.ts `runMigrations` — follow the existing pattern (db must be published before migrations run; see the PR #133 deadlock postmortem) |
| `POST /api/tasks/[id]/move` `{status, rank}` | new endpoint + authz + tests |
| Checklist endpoints | new, mirror comments endpoints' shape/tests |
| `GET /api/tasks?archived=1`; lazy archive sweep | tasks GET + meta-throttled updateMany |
| WIP limits + aging thresholds in constants.ts → `/api/config` | constants + config endpoint |
| `EDITABLE_FIELDS` additions (none for rank/status moves — those go through /move) | tasks [id] PATCH |

Server stamps `status_changed_at` on every status write path: PATCH `status`, PATCH
`assigned_to` (auto-start rule), /move, email-sync status updates, bulk actions.

## Explicitly out of scope

- **Custom/user-defined columns** — `TaskStatus` is a hardwired union across web, iOS, email-sync
  rules, and taskRules; not worth it for one client with a working workflow.
- **WebSocket/SSE push** — polling architecture stays (decision on record); pillar F makes it
  feel realtime enough.
- **Notifications** — shelved 2026-06-07 because the client didn't ask; the @mention-notify work
  is preserved on `feat/adoption-with-notifications` and can be revived if Raves requests it.
- Multi-board/projects, time tracking, Gantt/calendar views.

## Phasing (PR-sized, each independently shippable)

| Phase | Contents | Size |
|---|---|---|
| 0 | Groundwork: split TaskCard into components (no visual change); add `rank`/`status_changed_at` fields + migration + stamping | M |
| 1 | Persisted ordering: /move endpoint, drag persists rank, server sort | M |
| 2 | **Compact card + detail sheet** (the headline; preview-verified, screenshots to Bob before merge) | L |
| 3 | Filter bar (assignee/store/due/quote/source/text) replacing the store-filter bar | M |
| 4 | Flow signals: aging chips, WIP soft limits, auto-archive + archived view | M |
| 5 | Quick-add per column + bulk actions + keyboard basics | M |
| 6 | Checklists (API + sheet editor + card chip) | M |
| 7 | Merge-based poll + changed-card flash | S |
| 8 | Lenses/swimlanes (group by store) — stretch, scope-checked after 3 | L |
| 9 | iOS parity wave (incl. existing co-assignee gap) | L (separate track) |

Order rationale: 0–1 fix the standing bug cheaply and de-risk everything after; 2 is the demo
centerpiece and lands early; 3–4 are the operational-visibility story for the Raves pitch; 5–7
are quality-of-life; 8–9 follow once the core is stable.

## Risks

- **Phase 2 is a big visual swing** for daily users — preview screenshots/sign-off from Bob
  before merge (no beta environment exists yet; if the beta Container App lands first, stage it
  there).
- **Migrations** run at boot — keep them idempotent and follow the post-#133 ordering.
- **dnd regressions** — the bind:items / drag-shadow behavior has bitten before (comments in
  KanbanColumn document the traps); phases 1–2 need careful manual + preview testing of drag,
  including empty-column drops and mobile.
- **iOS drift** — every web phase widens the parity gap until phase 9; acceptable, but track it.

## Success criteria

- Drag order survives refreshes and other users' edits.
- Board with 500+ historical tasks loads and scrolls smoothly (archive + light card faces).
- A PM can answer "what's overdue for store #X assigned to Y" in two clicks.
- Stuck work is visible without anyone asking (aging chips, WIP).
- Demo flow: email arrives → card appears → filter to store → open sheet → checklist → done →
  auto-invoice (existing won-quote→invoice tie-in) — end-to-end in under two minutes.
