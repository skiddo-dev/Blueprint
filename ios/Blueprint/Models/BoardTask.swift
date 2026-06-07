import Foundation

/// A board task, mirroring the `Task` interface in `src/lib/types.ts`.
///
/// Named `BoardTask` (not `Task`) to avoid shadowing Swift's concurrency
/// `Task` type, which the views use for `Task { await … }`.
///
/// Decoding is deliberately defensive: only `_id` is required. Every other
/// field falls back to a sensible default so a single malformed or legacy
/// document never blanks the whole board. The backend serialises `_id` as a
/// string UUID (see `normalizeTask` in `src/lib/server/db.ts`), so no
/// ObjectId handling is needed.
struct BoardTask: Identifiable, Codable, Hashable {
    let id: String
    var title: String
    var description: String?
    var assignedTo: String
    var notes: String?
    var date: String?
    var status: TaskStatus
    var createdBy: String
    var attachmentIds: [String]
    var timeline: [TimelineEntry]
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case description
        case assignedTo = "assigned_to"
        case notes
        case date
        case status
        case createdBy = "created_by"
        case attachmentIds = "attachment_ids"
        case timeline
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    /// Human-posted comments, oldest-first — the subset of `timeline` the card's
    /// comment thread shows (replies included; the detail view nests them).
    var comments: [TimelineEntry] { timeline.filter { $0.isComment } }
    var commentCount: Int { timeline.lazy.filter { $0.kind == .comment }.count }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? "(untitled)"
        description = try? c.decode(String.self, forKey: .description)
        assignedTo = (try? c.decode(String.self, forKey: .assignedTo)) ?? ""
        notes = try? c.decode(String.self, forKey: .notes)
        date = try? c.decode(String.self, forKey: .date)
        status = (try? c.decode(TaskStatus.self, forKey: .status)) ?? .toDo
        createdBy = (try? c.decode(String.self, forKey: .createdBy)) ?? ""
        attachmentIds = (try? c.decode([String].self, forKey: .attachmentIds)) ?? []
        timeline = (try? c.decode([TimelineEntry].self, forKey: .timeline)) ?? []
        createdAt = try? c.decode(String.self, forKey: .createdAt)
        updatedAt = try? c.decode(String.self, forKey: .updatedAt)
    }
}

#if DEBUG
extension BoardTask {
    /// Memberwise initialiser for SwiftUI previews only. (Production code builds
    /// `BoardTask` via `Decodable`; this DEBUG-only init exists so #Preview blocks
    /// can construct sample data without a network round-trip.)
    init(id: String, title: String, assignedTo: String = "", notes: String? = nil,
         date: String? = nil, status: TaskStatus, createdBy: String = "preview",
         attachmentIds: [String] = [], timeline: [TimelineEntry] = []) {
        self.id = id
        self.title = title
        self.description = nil
        self.assignedTo = assignedTo
        self.notes = notes
        self.date = date
        self.status = status
        self.createdBy = createdBy
        self.attachmentIds = attachmentIds
        self.timeline = timeline
        self.createdAt = nil
        self.updatedAt = nil
    }

    static let samples: [BoardTask] = [
        BoardTask(id: "1", title: "Pour foundation — Lot 14", assignedTo: "Bob", date: "2026-06-12", status: .toDo),
        BoardTask(id: "2", title: "Framing inspection scheduling", assignedTo: "Andrew", date: "2026-06-15", status: .toDo),
        BoardTask(id: "3", title: "Vendor quote: rooftop HVAC unit", assignedTo: "Mike", status: .inProgress,
                  attachmentIds: ["a1"],
                  timeline: [
                    TimelineEntry(id: "t1", kind: .created, text: "Created from email — rooftop HVAC unit"),
                    TimelineEntry(id: "c1", kind: .comment, text: "Got the vendor quote — waiting on @Riley to confirm scope.",
                                  author: "Bob", mentions: ["Riley"], reactions: ["👍": ["Mike"]]),
                    TimelineEntry(id: "c2", kind: .comment, text: "Confirmed. Good to proceed.",
                                  author: "Riley", parentId: "c1"),
                  ]),
        BoardTask(id: "4", title: "Permit resubmittal — electrical", assignedTo: "Riley", date: "2026-06-09", status: .review),
        BoardTask(id: "5", title: "Final walkthrough punch list", assignedTo: "Kris", status: .done),
    ]
}
#endif
