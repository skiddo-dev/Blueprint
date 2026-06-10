# Blueprint — Email-to-Task Kanban for Grocery Construction

Turns flagged vendor emails, permits, and site alerts into actionable Kanban tasks, with AI-powered parsing. A SvelteKit full-stack app backed by MongoDB, with Microsoft Entra sign-in, a native iOS client, and **Blueprint Books** — a built-in double-entry accounting module (invoices/A-R, bills/A-P, financial statements, bank reconciliation, period close).

## Stack

- **SvelteKit 2 + Svelte 5** (runes), `@sveltejs/adapter-node`
- **Auth.js** (`@auth/sveltekit`) with **Microsoft Entra ID** sign-in
- **MongoDB** (Atlas) for tasks, users, and attachments
- **Microsoft Graph** for email sync (manual + real-time webhook push) + **OpenAI** for parsing
- **pdfkit** for quote PDFs, **DOMPurify** for safe email-HTML rendering
- Ships as a **Docker** image to **Azure Container Apps**
- Native **iOS** app (SwiftUI) in [`ios/`](ios/)

## Features

- Drag-and-drop Kanban board (drag from the `⠿` grip; columns: To Do → In Progress → Review → Done → On Hold → Cancelled)
- **Sync Emails** — pulls flagged messages from each PM's inbox (and a shared mailbox), parses date / assignee / quote / summary with OpenAI, and creates tasks. Runs on demand, or **in real time via Microsoft Graph webhooks** when a public `APP_BASE_URL` is configured. Only mail flagged on/after a cutoff date is synced (`EMAIL_SYNC_CUTOFF`).
- Per-card editing (status, assignee, date, quote, notes) with ~2s live refresh
- **Comments** — threaded card comments with `@mentions` and emoji reactions
- **Attachments** — upload, list, and delete files on a card; email attachments are imported automatically (both stored in MongoDB), and pertinent email-attachment contents (a bill, a schedule, even a scanned image) are AI-read and appended to the card summary
- **Global search** — ⌘K command palette across tasks, quotes, and prospects; task results deep-link to the board
- **Light / Dark / System theme**
- **Self-serve access requests** — an un-provisioned user can request access from the sign-in gate; admins approve/dismiss from the User Access panel (which also shows each user's last-active + weekly-active count).
- **CSV import** (admin) — bulk-create tasks from a CSV whose columns mirror the task export, so an export round-trips.
- **Quote Generator + Dashboard** (admin) — professional RAVES-branded proposal PDFs with **labor / materials / total print toggles** and a live cost-box preview (the full amount is always logged, whatever prints); every quote auto-logs into the Dashboard's win-rate / pipeline analytics
- **Blueprint Books** (admin, nav: *Accounting*) — full double-entry bookkeeping built in: a finance hub (cash / A-R / A-P / net-income KPIs with month-over-month deltas and a sparkline, monthly revenue-vs-expenses chart, aging charts), **invoices → payments → A/R aging** (create from a won quote; document attachments with AI receipt scan), **vendor bills → payments → A/P aging**, **purchase orders** (convert PO → bill), customer/vendor directories, **income statement / balance sheet / cash-flow** statements with one-click periods, **cash-basis toggle**, print, and **CSV export on every report**, **bank deposits** (Undeposited Funds → deposit slip), **bank reconciliation** with CSV auto-match, **fixed assets & depreciation** (straight-line / declining balance, book value tracking, disposal), **budgets + budget-vs-actual** reporting, **sales tax remittance + 1099 tracking**, **audit log**, year-end close with a Retained-Earnings closing entry, and client-ready invoice/bill PDFs. Also: **account registers** with running balances, a **General Ledger / Journal / P&L-by-month** report pack, **job costing** (per-job profit & margin), **credit memos / vendor credits / void** with an append-only reversal trail, **customer statement PDFs**, **recurring invoices, bills & journal entries** (atomic, never double-posts), and one-click **expense entry**. Money is integer cents; corrections are reversing entries (append-only audit trail). Walkthrough screenshots in [`docs/books-screenshots/`](docs/books-screenshots/).
- **Prospects** (admin) — a warehouse lead pipeline near Bloomfield Hills, MI built from **free, key-less public data**: OpenStreetMap (Overpass) for warehouse locations + footprint-derived size, and **Oakland County parcel GIS** for assessed value / class. Sortable table, status-colored Leaflet map, analytics charts (size / city / decade / distance / pipeline), live filters + search, CSV export, per-prospect status/assignee/notes, a detail modal (Google Maps + county-record links), and one-click **Add to Kanban board**. Set `USE_MOCK_DATA=true` to serve generated demo data offline.
- **Infra Spend** (admin) — live billing from Azure Container Apps, MongoDB Atlas, OpenAI, and GitHub, all pulled server-side and cached, so you can see what the platform costs in one place.
- **Hand-drawn SVG icon set** — 62 stroke glyphs on a 24×24 / 1.75px grid (`$lib/icons.ts` + `Icon.svelte`), rendered as `currentColor` SVGs app-wide: nav, login, board (toolbar, card chips, detail sheet, filters), dashboard section headings, accounting module, prospects, and infra. Comment-reaction emoji and celebratory empty-states are intentionally kept.
- Entra SSO with roles (admin / pm)

## Local development

**Prerequisites:** Node 22+, a MongoDB connection string, an Entra app registration, and an OpenAI API key.

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:8501  (PORT is configurable)
```

### `.env`

See [`.env.example`](.env.example) for the full, annotated list. The essentials:

```dotenv
# Auth.js + Microsoft Graph (Entra). The AZURE_* names are accepted as fallbacks.
AUTH_MICROSOFT_ENTRA_ID_ID=         # Entra app (client) ID
AUTH_MICROSOFT_ENTRA_ID_SECRET=     # Entra client secret
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=  # Entra directory (tenant) ID
AUTH_SECRET=                        # session secret — generate with: openssl rand -base64 32

AZURE_USER_EMAIL=        # shared mailbox to scan for flagged emails
# PM_MAILBOXES=          # comma-separated; overrides the default (every 'pm' user's inbox)

ADMIN_EMAILS=            # comma-separated; these addresses are always admin
MONGODB_URI=            # mongodb://...  or  mongodb+srv://...
# MONGO_DB_NAME=blueprint

OPENAI_API_KEY=          # sk-...
# OPENAI_MODEL=gpt-4o-mini          # model for email→task extraction

# Real-time email sync via Graph webhooks (optional; needs a public https origin):
# APP_BASE_URL=https://your-app.example.com
# GRAPH_WEBHOOK_SECRET=long-random-string

# Prospects runs on free public data live; set this to serve demo data instead:
# USE_MOCK_DATA=true

# Optional tuning: MAX_ATTACHMENT_SIZE_MB, MAX_ATTACHMENTS_PER_EMAIL,
#   GRAPH_FETCH_TIMEOUT_MS, MAX_SYNC_MESSAGES, EMAIL_SYNC_CUTOFF
```

All secrets are read at **runtime** via `$env/*/private` (never baked into the build).

### MongoDB (local) — replica set

Production runs on **MongoDB Atlas**, which is always a replica set, so multi-document
transactions and change streams are available there. A bare standalone `mongod` supports
neither — and the accounting module posts an invoice and its journal entry in a single
transaction — so for local dev run Mongo as a **single-node replica set**:

```bash
docker compose up -d mongo     # single-node replica set on :27017 (auto-initiated)
# then in .env:
MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0&directConnection=true
```

A plain `mongodb://localhost:27017/` still works for everything except transaction code
paths; use the replica-set URI to exercise those locally the way prod does.

## Testing

```bash
npm test          # run the Vitest unit suite once
npm run test:watch # watch mode while developing
npm run check     # svelte-check typecheck
```

Tests run through SvelteKit's Vite plugin, so `$lib` and `$env/*` resolve and
server-only modules (`$lib/server/*`) are importable. The OpenAI SDK is mocked,
so the suite makes no network calls and needs no real keys. Coverage spans the
high-blast-radius logic — email parsing / field-mapping and its never-block-a-sync
fallback, the sync cutoff + backfill, mailbox resolution, and the comments,
attachments, CSV-import, and search API routes.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) gates every pull
request on `npm run check`, `npm test`, and a production `npm run build`.

## Microsoft Entra setup

1. **App registration → Authentication → Web → Redirect URIs**, add:
   - `http://localhost:8501/auth/callback/microsoft-entra-id` (dev)
   - `https://<your-prod-domain>/auth/callback/microsoft-entra-id` (prod)
2. **Certificates & secrets** → new client secret → `AZURE_CLIENT_SECRET`.
3. **API permissions → Microsoft Graph → Application → `Mail.Read`** → grant admin consent. Email sync uses the app-only (`client_credentials`) flow to read flagged messages. (You can scope it with an [Application Access Policy](https://learn.microsoft.com/graph/auth-limit-mailbox-access) — make sure that scope covers every mailbox you sync: `AZURE_USER_EMAIL` plus each PM inbox in `PM_MAILBOXES`.)
4. **Real-time sync (optional):** set a public `APP_BASE_URL` and a `GRAPH_WEBHOOK_SECRET`, and the app subscribes to the mailbox so flagged emails become tasks immediately (no manual **Sync Emails** click). Graph can't call back to `localhost`, so this is skipped in dev.

## Access control (roles)

- **admin** — full app: board, Sync Emails, Clear All, Dashboard/Quotes pages, and the User Access panel. See the [Administrator Guide](docs/admin-user-guide.md) ([PDF](docs/admin-user-guide.pdf)).
- **pm** — board only: view/edit cards, no sync/clear/admin pages. See the [PM Guide](docs/pm-user-guide.md) ([PDF](docs/pm-user-guide.pdf)).

`ADMIN_EMAILS` are always admin (so you can sign in and provision everyone else before the `users` collection exists). Add colleagues via the sidebar **User Access** panel (roles stored in the MongoDB `users` collection). An authenticated user who isn't provisioned and isn't in `ADMIN_EMAILS` sees a "request access" screen.

## Build & deploy

```bash
npm run build     # adapter-node output in build/
node build        # run the production server (listens on PORT, default 3000)
```

Production runs as the Docker image in [`Dockerfile`](Dockerfile) on **Azure Container Apps**. Set the runtime env vars (above) as **Azure App Settings**, register the prod redirect URI, and — since the app sits behind the HTTPS ingress — set `ORIGIN=https://<your-prod-domain>` so SvelteKit's CSRF/origin check passes.

One-time deploy setup (registry, role assignment, optional GitHub Actions OIDC auto-deploy), plus **monitoring & alerting** and the **backup / restore / disaster-recovery runbook**, are documented in [`.github/DEPLOY.md`](.github/DEPLOY.md).

## iOS app

A native SwiftUI client lives in [`ios/`](ios/) and talks to the same API — see `ios/README.md`.
