# Blueprint — Administrator Guide

A complete walkthrough of Blueprint for **Administrators**. Admins have the full
app: the whole Kanban board (everyone's tasks), user management, email sync, and
the five admin-only workspaces — **Dashboard**, **Quote Generator**,
**📒 Accounting (Blueprint Books)**, **Prospects**, and **Competitive Landscape**.

> **Two roles.** Blueprint has **Admin** and **PM**. PMs are limited to their own
> tasks on the board; admins see and run everything. If you're looking for the
> day-to-day board basics (cards, comments, search, theme), those work the same
> for both roles and are covered in depth in the **[PM Guide](pm-user-guide.md)** —
> this guide focuses on what's **admin-only**.

---

## 1. Signing in & who is an admin

1. Open Blueprint and click **🔐 Sign in with Microsoft** (your company account).
2. You land on the **Kanban Board** with the full sidebar and nav.

You have admin rights if **either**:

- your email is in the server's **`ADMIN_EMAILS`** list (these accounts are
  *always* admin — this is the bootstrap so the first person can provision
  everyone else), **or**
- an existing admin has set your role to **admin** in **👥 User Access**.

A signed-in person with **no role** sees a *"request access"* screen until an
admin provisions them.

---

## 2. The board, as an admin

The board works the same as it does for a PM (drag the **⠿⠿** grip to move cards,
edit fields inline, everything auto-saves, the board live-refreshes ~every 2s).
What's different with admin rights:

- **You see every task** — not just your own. (PMs only ever load tasks assigned
  to or created by them.)
- **Assign to anyone** — the card and New-Task **Assign to** lists include all
  provisioned **PM users** *plus* the supervisor roster. (PMs can only assign to
  Unassigned or a supervisor.)
- **Inbox chips** — synced cards show a **📥** chip marking which PM mailbox the
  email was flagged in. Tap a store **#tag** to filter the board, same as a PM.
- **Comment moderation** — you can **edit or delete any** comment, not just your
  own.

### Admin controls in the sidebar / toolbar

- **🔄 Refresh now** (board toolbar) — pull flagged email right now (see
  §4; flagged mail also syncs on its own in the background).
- **🔔 Access Requests** — appears only when someone has asked for access;
  **approve** or **dismiss** each request right here (§3).
- **👁️ View User Activity** — pick a person to filter the board to **their**
  tasks; choose **All tasks** to go back. A read-only way to see any one PM's load.
- **👥 User Access** — add, update, and remove users, set their role, and see who's
  **active this week** and each person's **last-active** time (§3).
- **📥 Import Tasks (CSV)** — bulk-create tasks from a spreadsheet (§3).
- **⚠️ Danger Zone → Clear All Tasks** — bulk-delete (§10).
- **📖 Help & Guide** — opens this guide (the PDF) in a new tab. PMs get the PM
  guide from the same link.

---

## 3. Users, access requests & importing tasks

Three sidebar panels manage your people and bulk data.

### 👥 User Access — add / update / remove people

Open the sidebar → **👥 User Access**.

**To add or update someone:**

1. Enter their **Email** (e.g. `person@ravesinc.com`).
2. Enter their **Display Name** — ⚠️ this must **exactly match** the name shown in
   the task **"Assign to"** dropdown, otherwise assignment won't line up.
3. Pick a **Role** — **pm** (board, their own tasks) or **admin** (full app).
4. Click **➕ Add / Update**.

**To remove someone:** click the **✕** next to their row.

The panel also shows **adoption at a glance**: a header line — *"N of M active this
week"* — plus each person's **last-active** time (e.g. *3h ago*, *2d ago*, *never*),
so you can see who's actually using Blueprint.

Roles are stored in the database. Removing a user (and not having them in
`ADMIN_EMAILS`) drops them back to the *"request access"* screen next time they
sign in.

> **My Work follows the login identity.** A person's **My Work** view is matched to
> tasks by their **sign-in email**, not their display name — so renaming someone in
> this panel won't break their My Work. Admins listed in `ADMIN_EMAILS` are resolved
> to that same email identity, so their assigned tasks carry through too.

### 🔔 Access Requests — approve people who asked to get in

When someone signs in but hasn't been provisioned, they now land on an **"Access
Pending"** screen where they can **request access** (with an optional note about who
they are). Each pending request shows up in the sidebar under **🔔 Access Requests**
(with a count badge):

- **✓ Approve** — provisions them on the spot (defaulting to the **pm** role; adjust
  in **👥 User Access** afterward if they should be an admin).
- **✕ Dismiss** — clears the request without granting access.

The panel only appears while there are pending requests.

### 📥 Import Tasks (CSV) — bulk-create from a spreadsheet

Open **📥 Import Tasks (CSV)** in the sidebar to create many tasks at once.

1. **Upload** a `.csv` file or **paste** CSV text into the box.
2. The columns mirror the board's **Export** file — `title`, `status`,
   `assigned_to`, `date`, `notes`, and more. Only **`title`** is required; unknown
   columns are ignored.
3. Click **📥 Import**. You'll get a result line like *"✅ 12 created, 1 skipped."*

Tip: use **⬇ Download current tasks** (in the same panel) to grab a correctly
shaped file to use as your template.

---

## 4. Email sync — how emails become tasks

Blueprint turns **flagged** messages in a shared mailbox into Kanban tasks,
parsing the date, assignee, quote, and a summary with AI, and attaching any files.

- **Automatic** — the server keeps a Microsoft Graph push subscription alive and
  also runs a safety-net sync every ~10 minutes, so flagging an email is normally
  all that's needed; the task appears on its own.
- **Manual** — click **🔄 Refresh now** on the board to pull immediately (useful
  right after flagging something). It shows a short result message when done.

A newly synced task carries its **source** (📩 sender), the parsed fields, the
**📥 inbox** chip, and a **📄 Full Email** view; attachments appear under **📎**.
When an attachment is **pertinent to the work** — a bill, a schedule, even a
scanned image — the AI reads it too and appends the key details to the card's
summary, marked with **📎**, so nobody has to open the file to know what's in it.
(Files you upload by hand are *not* auto-analyzed.)

> **Flag-time cutoff.** To avoid back-importing years of old flagged mail, Blueprint
> only syncs messages **flagged on or after a configured cutoff date** (set at deploy
> time via `EMAIL_SYNC_CUTOFF`; currently early June 2026). Anything flagged before
> that is ignored — so if an old flagged email never turns into a card, that's why,
> not a bug. (Re-flagging it doesn't move its date, since the cutoff is judged by the
> message's received date.)

> Mailbox, Graph permissions, and the AI key are configured at deploy time — see
> the project **README** and **`.github/DEPLOY.md`**. As an admin user you don't
> manage those from the UI; you just flag email and (optionally) hit Refresh.

---

## 5. 📊 Dashboard

*Quote insights from the RAVES quote log plus quoted tasks from the board.*
Everything reacts live to the filter bar at the top.

**Filters (shareable):** Years, Deal size, Months, **Min decided** (the sample
threshold for the win-rate charts), **Estimator**, and **Work type**. Use:

- **🔗 Copy link** — copies the URL *with your current filters* so you can share
  or bookmark the exact view.
- **⬇ Export CSV** — exports the currently filtered quotes.
- **Reset** — clears filters back to defaults.

**💰 Quote Summary** — headline metrics: **Win Rate**, **Won Value**, **Open
Pipeline**, **Expected** (open × win rate), **Total Quoted**, **Quotes**, and the
current-year **Projected (FY)**.

**📈 Insights** — charts: Win Rate by Estimator, Win Rate by Work Type, Won vs
Lost by Deal Size, Quote Pipeline by Stage, Growth (Quoted vs Won by Year with a
win-rate line), Value Concentration by Estimator (Pareto), Top Stores by Value,
Quotes by Month (seasonality), and Total Quote Value by Type.

**🥇 Estimator Scorecards** — per-estimator quotes, win %, average deal, top work
type, and total value.

**🏬 Account Intelligence** — per-store quote count, value, win %, and last
quoted, with **⚠ at-risk** flags (≥3 decided and winning under 40%) and a
repeat-vs-first-time win-rate summary.

**🧾 Needs Review** — quotes that have a **PO but aren't marked Won** yet — your
follow-up list.

**🧾 Quote Tracker** — the working list. Flip each quote between **open / won /
lost**; the change saves immediately and every chart and metric above updates
with it. Filter the list by **open / won / lost / all**.

**📋 Raw Task Data** — the underlying task rows.

---

## 6. 💰 Quote Generator

Create a professional **proposal PDF** matching the RAVES Construction template.
Each one you generate is **auto-logged** (with a sequential Quote #/year) into the
quote log, so it immediately feeds the **Dashboard** analytics above.

The form is grouped into four sections:

1. **Client & project** — **Customer** *(the only required field)*, Store #,
   Point of Contact (with suggestions), and Work Type (with suggestions).
2. **Schedule & references** — Date Sent, Bid Due Date, optional PO, and a
   **Sitefolio** checkbox.
3. **Pricing** — two switches control **what prints in the proposal's cost box**:
   - **Labor cost** — prints a labor line (plus a materials line when you enter
     one). Switching it on reveals **Labor** and **Materials** fields, and the
     total auto-fills from labor + materials until you type your own.
   - **Total cost** — prints the total / amount line.

   A live **"Proposal cost box"** preview on the right shows *exactly* what the
   customer will see — including nothing at all if both switches are off.
   Whatever you choose, the **total quoted amount is always logged** to the quote
   log and Dashboard; the switches only change what the customer sees.
4. **Scope of work** — Description of work (prints on the PDF) and optional Notes.

Click **Generate proposal PDF**, then **⬇ Download proposal PDF**. Use
**Regenerate proposal** after edits.

---

## 7. 🏭 Prospects

A warehouse **lead pipeline** that pulls **live, key-less** data near the configured
search center. It now uses a free hybrid source — **OpenStreetMap** (Overpass) for
warehouse/industrial buildings (size is estimated from the building footprint), plus
**Oakland County's public parcel GIS** for assessed/market value and property use.
No API key is required. If `USE_MOCK_DATA=true` is set, it runs on realistic demo
data instead and shows a **"Demo data"** badge.

- **Pull controls** — set **Radius (mi)**, **Min size (sf)**, **Max size (sf)**,
  then **⟳ Pull prospects**. A result line reports how many were pulled / new /
  updated.
- **Filters** — search (address / owner / city), City, Status, and sliders for
  Size, Year built, and Distance. Shows the filtered count, a **Reset**, and a
  **⤓ CSV** export.
- **Summary cards** — Showing, Avg size, Closest, Qualified.
- **Charts** — Size distribution, Top cities, Year built by decade, Distance
  bands, and a Pipeline status doughnut.
- **Map** — a Leaflet map with the search-radius circle and **status-colored
  markers**; click a marker or a row to open the detail modal.
- **Table** — sortable by any column; set each prospect's **Status** and
  **Assignee** inline.
- **Detail modal** — property facts (size, year, owner, use, assessed/market
  value), editable **status / assignee / notes**, quick links to
  **📍 Google Maps** and **🗂️ County records**, and **➕ Add to Kanban board** to
  turn a lead into a task.

**Pipeline stages:** New → Contacted → Qualified → Dead.

> **What the free sources can and can't give you.** The county layer covers
> **Oakland County, MI only** and **withholds legal owner names** (the **Owner** you
> see is the OSM occupant/operator name when present, otherwise blank). Neither
> source has a reliable **year built**, so that column is often **—**. Values come
> from the county (market is assessed × 2 per Michigan SEV law). Outside Oakland
> County you'll still get buildings and sizes from OSM, just without the parcel
> enrichment.

---

## 8. 🗺️ Competitive Landscape

A self-contained, blueprint-themed **market sheet** embedded in the page
(read-only). Use it for the at-a-glance competitive/market picture; there's
nothing to edit here.

---

## 9. 📒 Blueprint Books — Accounting

Blueprint's built-in **double-entry bookkeeping**: invoices and receivables,
vendor bills and payables, financial statements, bank reconciliation, and a
period close — all in the same app as the board and quotes, no QuickBooks
round-trips. Every page shares a section nav
(**Overview · Receivables · Payables · Reports · Banking**) so you're never more
than one click from any part of the books.

### The Overview hub

Open **📒 Accounting** in the nav. The top of the page answers *"how are we
doing?"* at a glance:

- **KPI tiles** — **Cash on hand** (with this month's change and a 6-month
  sparkline), **A/R outstanding** (with the overdue slice in red), **A/P
  outstanding** (with what's **due within 7 days**), and **Net income YTD**
  (with this month's figure). The A/R, A/P, and net-income tiles click through
  to their detail pages.
- **Revenue vs expenses** — a month-by-month chart of the last 6 months;
  hover a month to see exact figures and the net.
- **A/R & A/P aging** — how old your open invoices and bills are, color-graded
  from current (green) to 90+ days (red).
- **Recent journal entries**, a collapsible **Trial Balance** (with an
  in-balance check — each account links into its **register**), and the
  **Period close** card (below). Quick actions include **💸 Record expense**
  for money spent without a bill (fuel, supplies, a permit paid on the spot).

### Invoices & getting paid (Receivables)

- **📄 Invoices** — the working list. **Filter pills** (All / Open / Overdue /
  Paid, with counts) plus a **search box** (customer or number). Due dates read
  as urgency — *"Due in 12d"*, *"20d overdue"* in red with the whole row
  tinted — and each row carries a **payment progress bar** and the footer totals
  the filtered set.
- **+ New invoice** — line items with live totals and tax; or **start from a won
  quote** (also reachable straight from the Dashboard quote tracker's
  *Create invoice →* link) so the amounts and PO carry over.
- **Invoice detail** — record payments (amount / date / method) as they arrive;
  status moves **open → partial → paid** automatically and every payment posts
  its own journal entry. **⬇ PDF** downloads a client-ready invoice. Made a
  mistake? **Void** reverses an untouched invoice outright (the reversal is
  dated today, so it works even into a locked period), and **"Issue a credit
  memo…"** reduces what's owed on a settled-in-part invoice — credits
  interleave with payments in one history and recompute the status.
- **🤝 Customers** — one line per customer with invoice count, total invoiced,
  and outstanding balance; edit names/emails inline (renames propagate to their
  invoices). Any customer with a balance gets a **Statement** link — a PDF of
  their open invoices with ages and the total due, ready to attach to a
  collections email.
- **📈 A/R Aging** — open invoices bucketed by days past due, chart on top,
  click any row to open the invoice.

### Bills & what you owe (Payables)

Mirrors receivables: **🧾 Bills** (same filters, urgency dates, progress bars),
**+ New bill** (each line books to an expense account — job materials,
subcontractors, rent…), bill detail with payments, **vendor credits**, and
**Void** (same rules as invoices), **⬇ PDF**, **🏗️ Vendors** directory, and
**📉 A/P Aging**.

### Reports

**📊 Reports** in the section nav opens the report index. The three financial
statements come first, each with **one-click period buttons**
(*This month · Last month · This quarter · YTD* — the balance sheet gets
*Today · End of last month · End of last year*), a plain-English line explaining
what the report shows, and a **🖨 Print** button that strips the app chrome for
a clean handoff to your bank or accountant:

- **📊 Income Statement** — revenue − cost of goods sold = gross profit, less
  operating expenses = **net income**.
- **🏦 Balance Sheet** — what the business owns vs owes on a date, with a
  **✓ Balanced** badge.
- **💵 Cash Flow** — where cash actually moved: operations, equipment,
  financing.

Beyond the statements, the index carries the **working reports**:

- **📒 Account register** — any account's transaction history with a running
  balance (a checkbook for every line of the chart); drill in from the trial
  balance, the General Ledger, or the register's own account picker.
- **📅 P&L by month** — the income statement spread one column per month
  (3 / 6 / 12-month windows) — the fastest way to spot a margin drift.
- **🏗️ Job profitability** — profit and margin per job. Tag invoices, bills,
  and expenses with a **job** name as you enter them (the field suggests every
  job already in use; invoices created from a won quote prefill it) and the
  per-job P&L builds itself.
- **📚 General Ledger** and **🧾 Journal** — every posting grouped by account
  with totals, and every entry in date order with full debit/credit detail.
  The pair your accountant reconciles against at tax time.

### ✅ Bank reconciliation

Match the books to a bank statement: pick the bank account, enter the
**statement date and ending balance**, then tick transactions until the
**difference reads $0.00 ✓** — only then does **Finish reconciliation** enable.
Optionally **paste your bank's CSV export** and Blueprint auto-ticks the
matching amounts. Past reconciliations are listed per account.

### 🔁 Recurring transactions

Monthly rent, retainer invoices, standing vendor bills, depreciation — set them
once and Blueprint posts them on schedule:

1. Fill out a normal **invoice**, **bill**, or **journal entry** form, then use
   **"🔁 Make this recurring…"** at the bottom: name it, pick *every N
   weeks/months*, and a first-run date. The schedule saves **without posting
   anything** until that date.
2. **🔁 Recurring** (section nav) lists every template with its cadence, next
   run, and last result; **pause / resume / delete** any time (already-posted
   documents stay — they're real books entries). **▶ Run now** posts anything
   currently due on demand.

The engine catches up missed periods, clamps month-ends sensibly (a template
dated the 31st posts on Feb 28), and can never double-post an occurrence.

### Period close & corrections

On the Overview hub:

- **Lock period** — blocks anything from posting on or before the chosen date
  (back-dating protection once a month is finalized).
- **Close year-end** — additionally posts the closing entry that rolls net
  income into **Retained Earnings**, then locks.

Blueprint Books is **append-only**: corrections are posted as **reversing
entries**, never edits — so the audit trail is always intact. Money is stored
as exact cents; the books balance to the penny or the entry doesn't post.

---

## 10. Global search & the danger zone

**Global search (⌘K / Ctrl+K)** — as an admin, search spans **tasks, quotes, and
prospects** (PMs only get their own tasks). Match by store #, PO, vendor,
assignee, customer, address, and more; **↑/↓** to move, **Enter** to open,
**Esc** to close. A task result jumps to it on the board and flashes the card.

**⚠️ Danger Zone → Clear All Tasks** — in the sidebar. This **permanently deletes
every task** on the board. You must tick the confirmation checkbox before the
button enables. Use with care — there's no undo.

---

## 11. Shared basics (same as PM)

These behave identically for both roles — see the **[PM Guide](pm-user-guide.md)**
for the details:

- **Task cards** — statuses/colors, drag-to-move, inline editing, store filters,
  delete, and a bottom **tool-chip bar** (📄 full email · 📝 note · 📎 attachments ·
  💬 comments) that opens one panel at a time. **Attachments** can now be
  **uploaded and removed**, not just downloaded — email-sourced files are purged
  after **30 days** (the entry stays, marked *expired*), while uploaded files are
  kept. Assigning a real person to a **To Do** task **auto-advances it to In
  Progress**.
- **Comments** — @mentions, replies, reactions, ⌘/Ctrl+Enter to post (admins can
  moderate any comment).
- **Theme** — ☀️ Light / 🌙 Dark / 🖥️ System.
- **Mobile** — ☰ menu, column pills, bottom-sheet dialogs.
- **Saving & offline** — auto-save, ~2s live refresh, offline banner with
  re-sync on reconnect.
- **Help & first run** — a **📖 Help & Guide** link in the sidebar opens this guide
  (PDF). On a brand-new, empty board you'll see a **"No tasks yet"** prompt with
  **✏️ New Task**, **🔄 Refresh now**, and a link to the guide instead of six empty
  columns.

---

## Quick reference

**Admin-only surfaces**

| Area | What it's for |
| --- | --- |
| **🔄 Refresh now** | Pull flagged email on demand |
| **🔔 Access Requests** | Approve / dismiss people asking for access |
| **👁️ View User Activity** | Filter the board to one person's tasks |
| **👥 User Access** | Add / update / remove users + roles; last-active & WAU |
| **📥 Import Tasks (CSV)** | Bulk-create tasks from a spreadsheet |
| **⚠️ Clear All Tasks** | Permanently delete all tasks |
| **📊 Dashboard** | Quote analytics, win rates, pipeline |
| **💰 Quote Generator** | Proposal PDFs with labor/total print toggles (auto-logged to analytics) |
| **📒 Accounting** | Blueprint Books — invoices/A-R, bills/A-P, statements, reconciliation, period close |
| **🏭 Prospects** | Warehouse lead pipeline + map (live OSM + county data) |
| **🗺️ Competitive Landscape** | Embedded market sheet |

**Admin extras on the board**

- See **all** tasks; **assign to anyone**; see **📥 inbox** chips.
- **Search** covers tasks **+ quotes + prospects**.
- **Edit / delete any** comment.

**Keyboard shortcuts** — `⌘K`/`Ctrl+K` search · `↑↓` move · `Enter` open ·
`Esc` close · `⌘/Ctrl+Enter` post a comment.

---

## Admin responsibilities & troubleshooting

- **Provisioning** — keep **👥 User Access** current; make sure each person's
  **Display Name** matches their **Assign to** name. Clear the **🔔 Access Requests**
  queue so nobody's left waiting.
- **Sync looks stale?** — flagged mail auto-syncs, but you can always hit
  **🔄 Refresh now**. If nothing comes in at all, it's usually a deploy-side
  config issue (mailbox / Graph permissions / keys) — see the README & DEPLOY doc.
- **An old flagged email never became a task** — expected: only mail flagged on or
  after the **`EMAIL_SYNC_CUTOFF`** date syncs (§4).
- **Prospects shows "Demo data"** — `USE_MOCK_DATA=true` is set; the live OSM +
  county source needs no key, so unset it for real results.
- **Error screen with an ID** — that reference id is logged server-side; capture
  it when reporting an issue so it can be traced.
