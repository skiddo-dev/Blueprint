# Blueprint — Native iOS App (SwiftUI)

A native SwiftUI client for Blueprint. It talks to the **existing** SvelteKit
backend over its JSON API and reuses the existing Microsoft Entra (Auth.js)
sign-in — **no backend or Azure changes are required.**

> **Scope: build-and-run-first.** This is the MVP shell: sign in, view the
> Kanban board, edit a task. App Store assets (icon, splash, submission) are
> intentionally deferred — see [Deferred](#deferred-follow-ups).

## What it does

- **Sign in** through the real web Entra flow shown in an embedded web view; the
  resulting Auth.js session cookie is reused for API calls.
- **Board** — loads `GET /api/tasks` and groups cards into the six statuses
  (`To Do → Cancelled`), with the same colors as the web app.
- **Edit a task** — tap a card to change status / assignee / date / notes; each
  change is saved via `PATCH /api/tasks/{id}` (`{ field, value }`).
- **Pull-to-refresh** and a manual refresh button. **Sign out** from the
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
  BlueprintApp.swift        @main entry; injects AppConfig + SessionStore
  Models/                   BoardTask, TaskStatus, BlueprintConfig.generated (npm run gen:ios)
  Networking/               AppConfig (base URL), APIClient (URLSession)
  Auth/                     SessionStore, WebAuthView (cookie hand-off)
  Views/                    Root, Login, Board, Column, TaskCard, TaskDetail
  Assets.xcassets, Info.plist
```

## Deferred (follow-ups)

Not in this MVP — create-task, email sync, "clear all", dashboard/quotes,
attachments, drag-to-reorder, offline cache, a native MSAL/token auth flow, and
the remaining App Store submission assets (launch screen art, screenshots,
archive & upload). A real 1024×1024 app icon **is** included
(`Assets.xcassets/AppIcon.appiconset/AppIcon.png`).

## Notes

- The board view filters tasks client-side; the API already scopes results by
  role (admins see all; others see their own).
- A `401/403` or a redirect to `/login` from the API is treated as an expired
  session and bounces you back to the sign-in screen.
