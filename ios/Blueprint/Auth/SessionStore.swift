import Foundation
import Observation
import WebKit

/// Tracks whether we hold a valid Auth.js session cookie. The cookie itself
/// lives in `HTTPCookieStorage.shared` (mirrored there by `WebAuthView`), which
/// `URLSession.shared` reads automatically. Injected into the SwiftUI
/// environment from `BlueprintApp`.
@Observable
final class SessionStore {
    var isAuthenticated: Bool

    init() {
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
        isAuthenticated = false
    }
}
