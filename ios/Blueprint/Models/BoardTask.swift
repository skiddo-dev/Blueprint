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
struct BoardTask: Identifiable, Decodable, Hashable {
    let id: String
    var title: String
    var description: String?
    var assignedTo: String
    var notes: String?
    var date: String?
    var status: TaskStatus
    var createdBy: String
    var attachmentIds: [String]
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
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

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
        createdAt = try? c.decode(String.self, forKey: .createdAt)
        updatedAt = try? c.decode(String.self, forKey: .updatedAt)
    }
}
