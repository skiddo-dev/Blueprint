import Foundation
import Observation
import WebKit

/// Tracks whether we hold a valid Auth.js session cookie, plus the signed-in
/// user's role (so admin-only actions can be gated client-side). The cookie
/// itself lives in `HTTPCookieStorage.shared` (mirrored there by `WebAuthView`),
/// which `URLSession.shared` reads automatically. Injected into the SwiftUI
/// environment from `BlueprintApp`.
@Observable
final class SessionStore {
    var isAuthenticated: Bool

    /// The signed-in user, populated from `GET /auth/session` after login. Nil
    /// until fetched; `role`/`displayName` come from the session callback in
    /// `auth.ts`. Used to gate admin-only UI (e.g. "Clear all", admin tabs).
    var user: SessionUser?

    var isAdmin: Bool { user?.isAdmin ?? false }
    var displayName: String? { user?.displayName ?? user?.name }

    init() {
        #if DEBUG
        // Local-only bypass mirroring the web's DEV_FAKE_AUTH: launching with
        // `-FAKE_AUTH` (and an admin role) boots straight to the board so the UI
        // can be exercised/screenshotted against a `USE_MOCK_DATA` dev server
        // without the interactive Entra web sign-in. DEBUG-stripped from release.
        if ProcessInfo.processInfo.arguments.contains("-FAKE_AUTH") {
            isAuthenticated = true
            user = SessionUser(email: "dev@local", name: "Dev Admin",
                               displayName: "Dev Admin", role: "admin")
            return
        }
        #endif
        isAuthenticated = SessionStore.hasSessionCookie()
    }

    /// Auth.js names its cookie `authjs.session-token` (or the `__Secure-…`
    /// prefixed variant over HTTPS); both contain `session-token`.
    static func hasSessionCookie() -> Bool {
        (HTTPCookieStorage.shared.cookies ?? []).contains { $0.name.contains("session-token") }
    }

    /// Re-evaluate auth state, e.g. right after the login web flow completes.
    func refresh() {
        isAuthenticated = SessionStore.hasSessionCookie()
    }

    /// Fetch the signed-in user's identity/role from the backend. Best-effort:
    /// failure leaves `user` untouched (admin UI simply stays hidden). Call
    /// after a successful sign-in / on board load.
    @MainActor
    func loadUser(baseURL: URL) async {
        if let fetched = try? await APIClient(baseURL: baseURL).session() {
            user = fetched
        }
    }

    /// Clear both the URLSession cookie store and the WKWebView data store so a
    /// fresh sign-in starts clean.
    func signOut() {
        for cookie in HTTPCookieStorage.shared.cookies ?? [] {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
        let store = WKWebsiteDataStore.default()
        store.fetchDataRecords(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes()) { records in
            store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), for: records) {}
        }
        user = nil
        isAuthenticated = false
    }
}
