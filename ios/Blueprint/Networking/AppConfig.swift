import Foundation
import Observation

/// Holds the backend base URL, persisted in `UserDefaults` so it survives
/// relaunches. Injected into the SwiftUI environment from `BlueprintApp`.
///
/// Default points at a local dev server (`npm run dev` serves `:8501`); the
/// `localhost` ATS exception in `Info.plist` allows the http load on the
/// simulator. Point it at the deployed HTTPS URL for a real device.
@Observable
final class AppConfig {
    private static let key = "blueprint.baseURL"

    var baseURLString: String {
        didSet { UserDefaults.standard.set(baseURLString, forKey: Self.key) }
    }

    /// Default backend the app points at before the user overrides it. Release
    /// builds (TestFlight / App Store) default to the deployed HTTPS backend so
    /// testers don't have to type anything; DEBUG builds default to a local dev
    /// server (`npm run dev` on :8501, reachable from the Simulator).
    static let defaultBaseURL: String = {
        #if DEBUG
        return "http://localhost:8501"
        #else
        return "https://raves-blueprint.icyglacier-c4295385.eastus.azurecontainerapps.io"
        #endif
    }()

    init() {
        baseURLString = UserDefaults.standard.string(forKey: Self.key) ?? Self.defaultBaseURL
    }

    /// Normalised base URL (trimmed, no trailing slash) or nil if unparseable.
    var baseURL: URL? {
        var s = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.scheme != nil, url.host != nil else { return nil }
        return url
    }
}
