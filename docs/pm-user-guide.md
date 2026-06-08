# Blueprint — Project Manager (PM) Guide

A practical walkthrough of everything you can do in Blueprint as a **Project
Manager**. Blueprint turns flagged vendor emails, permits, and site alerts into
Kanban tasks; as a PM, your workspace is the **board** — viewing, organizing, and
collaborating on the tasks that are yours.

> **What's my role?** Blueprint has two roles: **Admin** and **PM**. This guide
> covers the **PM** experience. The board is your home; the admin-only areas
> (Dashboard, Quote Generator, Prospects, Competitive Landscape, email sync, and
> user management) are noted at the end so you know what's there and who to ask.

---

## 1. Signing in

1. Open Blueprint in your browser. The sign-in screen recaps what Blueprint does —
   flagged vendor emails become tasks, everything lives on one board, and ⌘K finds
   anything fast.
2. Click **🔐 Sign in with Microsoft** and use your **company Microsoft account**.
3. You land on the **Kanban Board**.

If you sign in and see an **"Access Pending"** screen instead of the board, your
account hasn't been granted a role yet. Click **🙋 Request access** (you can add a
quick note about who you are) and an admin is notified — once they approve you,
just sign in again. No need to email anyone separately.

To sign out, open the sidebar and click **Log out**.

---

## 2. What you see: the board

The board has two parts:

- **Sidebar** (left on desktop; the **☰** menu on mobile) — your name and **PM**
  badge, **🔎 Search**, a **📖 Help & Guide** link (opens this guide as a PDF),
  **Log out**, the **theme** switch, and live **Board Stats** (a count per column
  plus an overall completion bar).
- **Board columns** — your tasks, grouped into six status columns.

> **First time in?** If your board is completely empty, you'll see a **"No tasks
> yet"** message — flagged vendor emails will sync in on their own, or you can press
> **✏️ New Task** to add the first one. There's a link to this guide right there too.

> **Heads-up — you see *your* tasks, not the whole company board.** Blueprint
> only loads tasks that are **assigned to you** *or* that **you created**. This
> keeps your board focused. (Admins see everyone's tasks.)

### The six columns

Tasks flow left to right. Each status has its own color, which also tints the top
edge of every card:

| Status | Meaning |
| --- | --- |
| 🟣 **To Do** | New / not started |
| 🟠 **In Progress** | Actively being worked |
| 🔵 **Review** | Waiting on a check or approval |
| 🟢 **Done** | Complete |
| ⚪ **On Hold** | Paused / blocked |
| 🔴 **Cancelled** | No longer needed |

### My Work vs. All Tasks

Just under the title is a toggle:

- **🙋 My Work** *(default)* — only tasks **assigned to you**. If any are past
  their due date, a red **"N overdue"** badge appears here.
- **📋 All Tasks** — everything on your board (tasks assigned to you **plus** ones
  you created).

Your choice is remembered in your browser for next time. If **My Work** is empty,
you'll see a shortcut to jump to **All Tasks**.

---

## 3. Working with a task card

Each card shows, top to bottom: the **title**, any **store-number tags**, a **PO
chip** (if present), the **source** (📩 from an email, or ✏️ created manually) and
**assignee**, a short **summary**, and the editable controls below.

Every edit you make **saves automatically** — there's no Save button.

### Move a task to another column

- **On a computer:** grab the **⠿⠿** handle in the card's top-right corner and
  **drag** the card into another column. (Only the handle starts a drag, so the
  rest of the card stays clickable.)
- **On a phone:** use the card's **Status** dropdown to change its column — the
  board shows one column at a time on small screens, so dragging across columns
  isn't practical there.

### Edit fields inline

- **Status** — the left dropdown; same as moving the card.
- **Assignee** — reassign to **Unassigned** or a **supervisor** (Ben, Kris, Vlad,
  Bogdan, Frank Crew). *Note: assigning a task away from yourself may remove it
  from your **My Work** view.* **Putting a real person on a "To Do" task
  automatically moves it to "In Progress"** — assigning someone means work has
  started. (Tasks already past To Do, or set back to Unassigned, are left alone.)
- **Due date** — pick a date. An overdue, still-open task shows the date in a
  muted rose with an "Overdue" tooltip (and feeds the **My Work** overdue badge).
- **Quote** — if a task has a quote, click the **💰** chip to open it and set the
  amount, the **pipeline stage** (Draft → Sent → Won → Lost), the quote **type**,
  and the responsible **person**.
- **Notes** — open the **📝** chip in the card's tool bar (below) and type; notes
  save when you click away. A small dot on the chip means the note has content.

### Store tags and the card tool bar

- **Store tags** — blue **#123** chips. Click one to **filter the whole board** to
  just that store; a bar appears up top with a **✕ Clear filter**. Click the tag
  again (or Clear) to remove the filter.
- **Tool chips** — along the bottom of each card is a single row of small,
  icon-only chips. Tap one to open its panel just below the card (one at a time):
  - **📄** — read the original **full email** safely (only on email-sourced tasks).
  - **📝** — the **note** box (above).
  - **📎** — **attachments** (the number shows the file count).
  - **💬** — **comments** (the number shows the comment count).
- **📎 Attachments** — open the chip to **download** any file (⬇️), **➕ Add file**
  to upload your own (you can pick several at once), or remove one with **✕**. Files
  that arrived **with an email** are kept for **30 days**, then the download is
  removed and the entry shows **"expired"** (the record stays on the card); files
  **you upload** are kept indefinitely.

### Delete a task

Click the small **✕** in the card's bottom-right corner. (Use this for cards you
own — deleting is permanent.)

---

## 4. Creating a task

1. Click **✏️ New Task** (top-right of the board).
2. Fill in:
   - **Title** *(required)* — what needs to get done.
   - **Assign to** — Unassigned or a supervisor.
   - **Status** — which column it starts in (defaults to **To Do**).
   - **Due Date** — optional.
   - **Quote** — optional amount, e.g. `$12,000`.
   - **Notes** — any extra context.
3. Click **Create Task**.

The task appears on your board immediately. Because you created it, it stays
visible to you on **All Tasks** even if it's assigned to someone else. **Heads-up:**
if you create it as **To Do** with a person assigned, it opens straight in **In
Progress** (assigning someone means work has started).

---

## 5. Comments, @mentions, and reactions

Open a card's **💬** chip (in the tool bar along the bottom of the card) to discuss
a task in context.

- **Comment** — type in the box and click **Post** (or press **⌘/Ctrl + Enter**).
- **@mention** — type `@` and start a name; pick from the autocomplete (**Enter**
  or **Tab** accepts the top match). Mentioned names are highlighted in the posted
  comment.
- **Reply** — click **Reply** under a comment to thread a response beneath it.
- **React** — click **＋** and choose an emoji; click a reaction chip to toggle
  your own reaction on or off.
- **Edit / delete** — use **✏️** / **✕** on your **own** comments. (Admins can
  edit or delete any comment.)

Comments appear for everyone on the task in near real time.

---

## 6. Search (⌘K)

Press **⌘K** (Mac) or **Ctrl+K** (Windows) anywhere — or click **🔎 Search** in
the sidebar — to open the command palette.

- Type at least **2 characters**. Search matches task titles, store numbers, POs,
  vendors, and assignees.
- Navigate with **↑ / ↓**, open with **↵ Enter**, dismiss with **Esc**.
- Selecting a task **jumps to it on the board** and briefly **flashes** the card
  so it's easy to spot. (Searching automatically switches you to **All Tasks** and
  clears any store filter so the card is guaranteed to be visible.)

As a PM, search covers **your tasks**. (Quotes and Prospects are admin-only data
and won't appear in your results.)

---

## 7. Light, dark, or system theme

In the sidebar, click the **theme** button to cycle **☀️ Light → 🌙 Dark → 🖥️
System**. **System** follows your device's appearance setting. Your choice is
remembered, and the app loads in the right theme with no flash.

---

## 8. On your phone

Blueprint is built to work on a phone:

- Tap **☰** (top-left) to open the sidebar (search, log out, theme, stats).
- Use the **column pills** to switch between statuses — the board shows one column
  at a time on small screens.
- Move cards between columns with the card's **Status** dropdown (not drag).
- The **New Task** form and **menu** open as bottom sheets sized for thumbs.

---

## 9. Saving, real-time updates, and going offline

- **Auto-save** — every change writes to the server automatically.
- **Live board** — the board refreshes itself about every **2 seconds**, so edits
  from teammates show up without a manual reload.
- **Offline** — if you lose connection, a **📡 offline** banner appears and a
  notice warns that changes won't save until you reconnect. When you're back
  online, the board re-syncs to the latest server state. If a save fails, you'll
  see a brief warning so nothing is silently lost.

---

## 10. What's admin-only (and not on your board)

These exist in Blueprint but require the **Admin** role. If you need something
here, ask an admin:

- **📊 Dashboard** — analytics across all tasks.
- **💰 Quote Generator** — building and exporting PDF quotes.
- **🏭 Prospects** & **🗺️ Competitive Landscape** — the warehouse lead pipeline
  and market map.
- **🔄 Refresh / Sync Emails** — pulling flagged emails into tasks. *(This runs
  automatically in the background regardless — flagged emails become tasks on
  their own.)*
- **👥 User Access** — adding people, setting roles, approving **access requests**,
  and **CSV-importing** tasks in bulk.
- **👁️ View User Activity** ("view as" another user) and **Clear All Tasks**.

Trying to open an admin page simply returns you to the board.

---

## Quick reference

**Keyboard shortcuts**

| Action | Shortcut |
| --- | --- |
| Open / close search | **⌘K** / **Ctrl+K** |
| Search: move selection | **↑ / ↓** |
| Search: open result | **Enter** |
| Search / dialogs: close | **Esc** |
| Post a comment | **⌘/Ctrl + Enter** |
| Accept @mention | **Enter** or **Tab** |

**At a glance**

- You see **only your tasks** (assigned to you or created by you).
- **Drag** to move cards on desktop; use the **Status dropdown** on mobile.
- Everything **auto-saves**; the board **auto-refreshes** every ~2s.
- **My Work** = assigned to you; **All Tasks** = yours + ones you created.

---

## Getting help

The **📖 Help & Guide** link in the sidebar reopens this guide any time. If
something looks wrong — a missing task, a card that won't save, an access screen you
didn't expect — note what you were doing and reach out to your Blueprint admin. If an
error screen shows a reference **ID**, include it; it helps them trace exactly what
happened.
