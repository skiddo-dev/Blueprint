import Foundation

/// Compact dashboard KPIs from `GET /api/dashboard` (computed server-side). The
/// web dashboard renders richer interactive charts; this is the mobile subset.
struct DashboardSummary: Decodable {
    var totalTasks: Int
    var tasksByStatus: [String: Int]
    var totalQuotes: Int
    var quotesByStatus: QuoteCounts
    var quoteValue: QuoteValue

    struct QuoteCounts: Decodable, Hashable {
        var won: Int
        var lost: Int
        var open: Int
    }

    struct QuoteValue: Decodable, Hashable {
        var won: Double
        var lost: Double
        var open: Double
        var total: Double
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totalTasks = (try? c.decode(Int.self, forKey: .totalTasks)) ?? 0
        tasksByStatus = (try? c.decode([String: Int].self, forKey: .tasksByStatus)) ?? [:]
        totalQuotes = (try? c.decode(Int.self, forKey: .totalQuotes)) ?? 0
        quotesByStatus = (try? c.decode(QuoteCounts.self, forKey: .quotesByStatus)) ?? QuoteCounts(won: 0, lost: 0, open: 0)
        quoteValue = (try? c.decode(QuoteValue.self, forKey: .quoteValue)) ?? QuoteValue(won: 0, lost: 0, open: 0, total: 0)
    }

    enum CodingKeys: String, CodingKey {
        case totalTasks, tasksByStatus, totalQuotes, quotesByStatus, quoteValue
    }
}

#if DEBUG
extension DashboardSummary {
    init(totalTasks: Int, tasksByStatus: [String: Int], totalQuotes: Int,
         quotesByStatus: QuoteCounts, quoteValue: QuoteValue) {
        self.totalTasks = totalTasks
        self.tasksByStatus = tasksByStatus
        self.totalQuotes = totalQuotes
        self.quotesByStatus = quotesByStatus
        self.quoteValue = quoteValue
    }

    static let sample = DashboardSummary(
        totalTasks: 35,
        tasksByStatus: ["To Do": 7, "In Progress": 6, "Review": 11, "Done": 4, "On Hold": 3, "Cancelled": 4],
        totalQuotes: 18,
        quotesByStatus: QuoteCounts(won: 7, lost: 4, open: 7),
        quoteValue: QuoteValue(won: 184_500, lost: 61_200, open: 312_750, total: 558_450)
    )
}
#endif
