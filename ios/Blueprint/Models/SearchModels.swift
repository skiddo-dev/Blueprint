import Foundation

/// One global-search hit — mirrors `SearchHit` in `src/lib/search.ts`.
struct SearchHit: Identifiable, Decodable, Hashable {
    let type: String        // "task" | "quote" | "prospect"
    let id: String
    let title: String
    let subtitle: String?
    let href: String

    /// Unique within a combined list (ids can repeat across types).
    var listID: String { "\(type):\(id)" }
}

/// `GET /api/search?q=` response — hits grouped by entity type.
struct SearchResults: Decodable {
    var tasks: [SearchHit]
    var quotes: [SearchHit]
    var prospects: [SearchHit]

    static let empty = SearchResults(tasks: [], quotes: [], prospects: [])

    var isEmpty: Bool { tasks.isEmpty && quotes.isEmpty && prospects.isEmpty }

    init(tasks: [SearchHit] = [], quotes: [SearchHit] = [], prospects: [SearchHit] = []) {
        self.tasks = tasks
        self.quotes = quotes
        self.prospects = prospects
    }
}
