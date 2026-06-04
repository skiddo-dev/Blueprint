import SwiftUI
import WebKit

/// A sheet that hosts the existing web sign-in flow. The user completes the
/// real Microsoft Entra (Auth.js) login inside an embedded `WKWebView` against
/// the backend's own origin — so **no new Azure redirect URI is required**.
/// Once the Auth.js session cookie appears, we mirror it into the shared
/// `HTTPCookieStorage` (which `URLSession` uses) and dismiss.
struct AuthSheet: View {
    let baseURL: URL
    let onComplete: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebAuthView(
                startURL: baseURL.appendingPathComponent("login"),
                host: baseURL.host ?? "",
                onComplete: {
                    onComplete()
                    dismiss()
                }
            )
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

struct WebAuthView: UIViewRepresentable {
    let startURL: URL
    let host: String
    let onComplete: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onComplete: onComplete, host: host) }

    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: startURL))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let onComplete: () -> Void
        private let host: String
        private var finished = false

        init(onComplete: @escaping () -> Void, host: String) {
            self.onComplete = onComplete
            self.host = host
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
                guard let self, !self.finished else { return }
                let relevant = cookies.filter { self.matches(domain: $0.domain) }
                // Mirror every cookie for this host into the store URLSession reads.
                for cookie in relevant { HTTPCookieStorage.shared.setCookie(cookie) }
                if relevant.contains(where: { $0.name.contains("session-token") }) {
                    self.finished = true
                    DispatchQueue.main.async { self.onComplete() }
                }
            }
        }

        /// Cookie domains may be `host`, `.host`, or a parent — match loosely.
        private func matches(domain: String) -> Bool {
            let d = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
            return host == d || host.hasSuffix("." + d) || d.hasSuffix("." + host) || host.contains(d) || d.contains(host)
        }
    }
}
