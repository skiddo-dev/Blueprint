# Blueprint — Native iOS App (SwiftUI)

A native SwiftUI client for Blueprint. It talks to the **existing** SvelteKit
backend over its JSON API and reuses the existing Microsoft Entra (Auth.js)
sign-in — **no backend or Azure changes are required.**

> **Scope: feature-complete client.** Sign in, work the board (create / edit /
> comment / drag / delete), and use the admin sections (Dashboard, Quotes,
> Prospects, Search). The only thing left for the App Store is the signed upload,
> which needs an Apple Developer team — see [App Store submission](#app-store-submission).

## What it does

- **Sign in** through the real web Entra flow shown in an embedded web view; the
  resulting Auth.js session cookie is reused for API calls. The signed-in user's
  role (`GET /auth/session`) gates the admin-only tabs and actions.
- **Board** — loads `GET /api/tasks` and groups cards into the six statuses
  (`To Do → Cancelled`), with the same colors as the web app. Survives a cold
  launch with no network from an on-disk cache (clearly marked *Offline*).
- **Create a task** — the `+` button posts to `POST /api/tasks`.
- **Edit a task** — tap a card to change status / assignee / date / notes; each
  change is saved via `PATCH /api/tasks/{id}` (`{ field, value }`). **Delete** a
  task, or (admin) **Clear all**.
- **Comments & @mentions** — post comments and replies on a card, react with
  emoji; mentions are resolved server-side (`POST /api/tasks/{id}/comments`).
- **Drag-and-drop** — drag a card between columns to change its status.
- **Dashboard** *(admin)* — task counts by status and quote value/counts by
  outcome (`GET /api/dashboard`).
- **Quotes** *(admin)* — the tracked-quote log (`GET /api/quotes`); tap a quote
  to set its outcome won / lost / open (`POST /api/quotes/{id}/status`).
- **Prospects** *(admin)* — the warehouse-lead pipeline (`GET /api/prospects`);
  tap to edit pipeline status / assignee / notes (`PATCH /api/prospects/{id}`).
- **Search** — global search (`GET /api/search`), role-scoped server-side;
  tapping a task result jumps to the Board and opens it.
- **Sync email** *(admin)* — trigger a sync from the account menu (`POST /api/sync`).
- **Pull-to-refresh** and manual refresh buttons. **Sign out** from the
  top-left menu.

## How it talks to the backend

| Concern | Approach |
| --- | --- |
| Data | `URLSession` → `GET /api/tasks`, `PATCH /api/tasks/{id}`. Native requests aren't subject to CORS, so this works against the same origin the website uses. |
| Auth | `WebAuthView` (a `WKWebView`) loads `<backend>/login`; after Entra login the Auth.js session cookie is mirrored into `HTTPCookieStorage.shared`, which `URLSession` sends automatically. |
| Azure | Nothing to change — login happens on the backend's own web origin, so no new redirect URI is needed. |

## Requirements

- **macOS with Xcode 16+** (this project targets iOS 17+).
- A reachable backend: either run the web app locally (`npm run dev` from the
  repo root → serves `http://localhost:8501`) or use your deployed HTTPS URL.

## Build & run

1. **Open the project**

   ```bash
   cd ios
   open Blueprint.xcodeproj
   ```

   If it doesn't open cleanly on your Xcode version, regenerate it from the
   committed [`project.yml`](project.yml):

   ```bash
   brew install xcodegen   # one-time
   xcodegen generate       # rewrites Blueprint.xcodeproj
   ```

2. **Pick a destination & signing.** Choose an iPhone **Simulator** to run with
   no signing. To run on a **physical device**, select your team under
   *Signing & Capabilities* (and change `PRODUCT_BUNDLE_IDENTIFIER` from
   `com.blueprint.app` if it collides).

3. **Run** (⌘R). In the app:
   - Enter the **Backend URL** (defaults to `http://localhost:8501` for the
     Simulator; use your `https://…` URL on device).
   - Tap **Sign in with Microsoft** and complete the Entra login.
   - The board loads. Tap a card, change its status, **Save** — refresh the web
     app to confirm it persisted (same database).

## Preview a screen (no Simulator, no backend)

Every screen ships a SwiftUI `#Preview`, so you can see it render live in Xcode's
Canvas without building the whole app or running a backend:

1. Open a view file — e.g. `Blueprint/Views/LoginView.swift`, `TaskCardView.swift`,
   `ColumnView.swift`, or `TaskDetailView.swift`.
2. Show the Canvas: **Editor ▸ Canvas** (⌥⌘↩), then **Resume** if it's paused.

Previews use built-in sample data (`BoardTask.samples`, guarded by `#if DEBUG`).
The full board (`BoardView`) loads from the API, so preview that one by running in
the Simulator (**⌘R**) against a backend.

## Configuration

The backend URL is set in-app (persisted in `UserDefaults`) — there's nothing to
edit in code to point at a different environment. The default and the
`localhost` plain-http allowance live in
[`Blueprint/Info.plist`](Blueprint/Info.plist) (an App Transport Security
exception scoped to `localhost`; production HTTPS needs none).

## Shared config (generated)

`Models/BlueprintConfig.generated.swift` is the Swift mirror of the web app's UI
constants — status colours/icons, quote rosters, quote/prospect status meta. It
is **generated, never hand-edited**: the single source of truth is
[`src/lib/constants.ts`](../src/lib/constants.ts) (also served at `GET /api/config`).
`TaskStatus` reads its colours/glyph from it, so the board can no longer silently
drift from the web app's palette the way the old hand-copied tables did.

Regenerate after changing `constants.ts` — run from the **repo root** (needs Node ≥23):

```bash
npm run gen:ios
```

CI can guard a stale checkout with `npm run gen:ios:check` (regenerates, fails on a
diff). The file is wired into both `project.yml` (folder glob, for `xcodegen`) and
the committed `Blueprint.xcodeproj`.

## Project layout

```
Blueprint/
  BlueprintApp.swift        @main entry; injects AppConfig + SessionStore + AppRouter
  Models/                   BoardTask, TimelineEntry, TaskStatus, Quote, Prospect,
                            DashboardSummary, SearchModels, BlueprintConfig.generated (npm run gen:ios)
  Networking/               AppConfig (base URL), APIClient (URLSession), AppRouter (tabs/deep-links), BoardCache (offline)
  Auth/                     SessionStore (auth + role), WebAuthView (cookie hand-off)
  Views/                    Root, Main (TabView), Login, Board, Column, TaskCard, TaskDetail,
                            NewTask, Comments, Dashboard, Quotes, Prospects, Search, Badges
  Assets.xcassets, Info.plist
```

## Local verification (Simulator, no device/account)

The app ships **DEBUG-only** launch arguments (compiled out of Release builds —
verified: a Release build launched with `-FAKE_AUTH` still shows the login
screen) so screens can be exercised against a mock dev server without the
interactive Entra sign-in:

```bash
# 1. Mock backend with auto-auth (from the repo root):
USE_MOCK_DATA=true DEV_FAKE_AUTH=true npm run dev   # serves :8501

# 2. Build & install to a booted Simulator:
cd ios && xcodegen generate
xcodebuild -project Blueprint.xcodeproj -scheme Blueprint \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcrun simctl install booted "$(find ~/Library/Developer/Xcode/DerivedData/Blueprint-*/Build/Products/Debug-iphonesimulator -name Blueprint.app -maxdepth 1 | head -1)"

# 3. Launch straight into a screen (admin session faked):
xcrun simctl launch booted com.blueprint.app -FAKE_AUTH                 # board (tabbed)
xcrun simctl launch booted com.blueprint.app -FAKE_AUTH -TAB dashboard  # a specific tab
xcrun simctl launch booted com.blueprint.app -FAKE_AUTH -TAB search -QUERY inspection
xcrun simctl launch booted com.blueprint.app -SCREEN detail             # one view + sample data
```

`-SCREEN` values: `detail`, `newtask`, `quote`, `prospect`. `-TAB` values:
`dashboard`, `quotes`, `prospects`, `search`.

## App Store submission

Everything is in place except the **signed upload**, which requires an Apple
Developer account:

1. **Set your Team ID.** In [`project.yml`](project.yml) set
   `DEVELOPMENT_TEAM` (and a unique `PRODUCT_BUNDLE_IDENTIFIER` if
   `com.blueprint.app` is taken), then `xcodegen generate`.
2. **Archive** (real device SDK):
   ```bash
   xcodebuild -project Blueprint.xcodeproj -scheme Blueprint \
     -sdk iphoneos -configuration Release -archivePath build/Blueprint.xcarchive archive
   ```
3. **Upload** the archive via Xcode's Organizer (or `xcrun altool` /
   `xcrun notarytool`) to App Store Connect → TestFlight.
4. **Store listing** — add screenshots (the `simctl io booted screenshot` shots
   from local verification work) and the privacy/description metadata in App
   Store Connect.

Already done for submission: a 1024×1024 app icon
(`Assets.xcassets/AppIcon.appiconset/AppIcon.png`), a branded launch screen
(`LaunchLogo` on `LaunchBackground`, wired in `Info.plist`), portrait-only, and
`ITSAppUsesNonExemptEncryption=false` (standard HTTPS only — skips the
export-compliance prompt).

## Still deferred (non-blocking)

Attachments (view/upload), a native MSAL/token auth flow (the web-cookie flow
works today), the prospect map, and richer interactive dashboard charts.

## Notes

- The board view filters tasks client-side; the API already scopes results by
  role (admins see all; others see their own).
- A `401/403` or a redirect to `/login` from the API is treated as an expired
  session and bounces you back to the sign-in screen.
