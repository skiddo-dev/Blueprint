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

    init() {
        baseURLString = UserDefaults.standard.string(forKey: Self.key) ?? "http://localhost:8501"
    }

    /// Normalised base URL (trimmed, no trailing slash) or nil if unparseable.
    var baseURL: URL? {
        var s = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.scheme != nil, url.host != nil else { return nil }
        return url
    }
}
