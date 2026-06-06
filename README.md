# Blueprint — Email-to-Task Kanban for Grocery Construction

Turns flagged vendor emails, permits, and site alerts into actionable Kanban tasks, with AI-powered parsing. A SvelteKit full-stack app backed by MongoDB, with Microsoft Entra sign-in and a native iOS client.

## Stack

- **SvelteKit 2 + Svelte 5** (runes), `@sveltejs/adapter-node`
- **Auth.js** (`@auth/sveltekit`) with **Microsoft Entra ID** sign-in
- **MongoDB** (Atlas) for tasks, users, and attachments
- **Microsoft Graph** for email sync + **OpenAI** for parsing
- **pdfkit** for quote PDFs, **DOMPurify** for safe email-HTML rendering
- Ships as a **Docker** image to **Azure Container Apps**
- Native **iOS** app (SwiftUI) in [`ios/`](ios/)

## Features

- Drag-and-drop Kanban board (drag from the `⠿` grip; columns: To Do → Cancelled)
- **Sync Emails** — pulls flagged messages from a shared mailbox, parses date / assignee / quote / summary with OpenAI, and creates tasks (with attachments stored in MongoDB)
- Per-card editing (status, assignee, date, quote, notes) with ~2s live refresh
- PDF quote generation and a Dashboard (admin)
- **Prospects** (admin) — pulls warehouse properties (45,000–75,000 sq ft within 30 mi of Bloomfield Hills, MI) from the **ATTOM Data API** onto a sortable table + map. Falls back to realistic mock data when no `ATTOM_API_KEY` is set, so the page works in dev/demo.
- Entra SSO with roles (admin / pm)

## Local development

**Prerequisites:** Node 22+, a MongoDB connection string, an Entra app registration, and an OpenAI API key.

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:8501  (PORT is configurable)
```

### `.env`

```dotenv
AUTH_SECRET=              # session secret — generate with: openssl rand -base64 32
AZURE_CLIENT_ID=          # Entra app (client) ID
AZURE_CLIENT_SECRET=      # Entra client secret
AZURE_TENANT_ID=          # Entra directory (tenant) ID
AZURE_USER_EMAIL=         # shared mailbox to sync flagged emails from
ADMIN_EMAILS=             # comma-separated; these addresses are always admin
MONGODB_URI=              # mongodb+srv://...
OPENAI_API_KEY=           # sk-...
ATTOM_API_KEY=            # ATTOM Data API key for the Prospects page (optional — mock data without it)
# optional: MONGODB_DB_NAME (default "blueprint"), MAX_ATTACHMENT_SIZE_MB, MAX_ATTACHMENTS_PER_EMAIL,
#           ATTOM_API_BASE, ATTOM_PROPERTY_TYPE (default "WAREHOUSE")
```

All secrets are read at **runtime** via `$env/*/private` (never baked into the build).

## Testing

```bash
npm test          # run the Vitest unit suite once
npm run test:watch # watch mode while developing
npm run check     # svelte-check typecheck
```

Tests run through SvelteKit's Vite plugin, so `$lib` and `$env/*` resolve and
server-only modules (`$lib/server/*`) are importable. The OpenAI SDK is mocked,
so the suite makes no network calls and needs no real keys. Current coverage
focuses on the pure logic with the highest blast radius — store-number
extraction, name normalization, and the email parser's field-mapping plus its
never-block-a-sync fallback.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) gates every pull
request on `npm run check`, `npm test`, and a production `npm run build`.

## Microsoft Entra setup

1. **App registration → Authentication → Web → Redirect URIs**, add:
   - `http://localhost:8501/auth/callback/microsoft-entra-id` (dev)
   - `https://<your-prod-domain>/auth/callback/microsoft-entra-id` (prod)
2. **Certificates & secrets** → new client secret → `AZURE_CLIENT_SECRET`.
3. **API permissions → Microsoft Graph → Application → `Mail.Read`** → grant admin consent. Email sync uses the app-only (`client_credentials`) flow to read `AZURE_USER_EMAIL`'s flagged messages. (You can scope this to just that mailbox with an [Application Access Policy](https://learn.microsoft.com/graph/auth-limit-mailbox-access).)

## Access control (roles)

- **admin** — full app: board, Sync Emails, Clear All, Dashboard/Quotes pages, and the User Access panel.
- **pm** — board only: view/edit cards, no sync/clear/admin pages.

`ADMIN_EMAILS` are always admin (so you can sign in and provision everyone else before the `users` collection exists). Add colleagues via the sidebar **👥 User Access** panel (roles stored in the MongoDB `users` collection). An authenticated user who isn't provisioned and isn't in `ADMIN_EMAILS` sees a "request access" screen.

## Build & deploy

```bash
npm run build     # adapter-node output in build/
node build        # run the production server (defaults to PORT 8501)
```

Production runs as the Docker image in [`Dockerfile`](Dockerfile) on **Azure Container Apps**. Set the runtime env vars (above) as **Azure App Settings**, register the prod redirect URI, and — since the app sits behind the HTTPS ingress — set `ORIGIN=https://<your-prod-domain>` so SvelteKit's CSRF/origin check passes.

One-time deploy setup (registry, role assignment, optional GitHub Actions OIDC auto-deploy) is documented in [`.github/DEPLOY.md`](.github/DEPLOY.md).

## iOS app

A native SwiftUI client lives in [`ios/`](ios/) and talks to the same API — see `ios/README.md`.
