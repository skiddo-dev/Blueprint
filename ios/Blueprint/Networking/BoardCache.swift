import Foundation

/// A tiny on-disk cache of the last successfully-loaded board, so a cold launch
/// renders instantly and a launch with no network still shows the last-known
/// board (clearly marked stale in the UI). Best-effort: every operation fails
/// silently — the cache is an optimisation, never a source of truth.
enum BoardCache {
    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("board-cache.json")
    }

    static func save(_ tasks: [BoardTask]) {
        guard let data = try? JSONEncoder().encode(tasks) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    static func load() -> [BoardTask]? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode([BoardTask].self, from: data)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
