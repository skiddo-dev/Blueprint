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
    /// Server-extracted store/site numbers (`store_numbers`), when present.
    var storeNumbersRaw: [String]?
    /// Email-origin fields (present only on cards synced from a flagged email).
    var exchangeId: String?
    var senderName: String?
    var senderEmail: String?
    /// Quote pipeline fields + purchase-order number, shown as card chips.
    var quote: String?
    var quoteStatus: String?
    var po: String?

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
        case storeNumbersRaw = "store_numbers"
        case exchangeId = "exchange_id"
        case senderName = "sender_name"
        case senderEmail = "sender_email"
        case quote
        case quoteStatus = "quote_status"
        case po
    }

    /// Human-posted comments, oldest-first — the subset of `timeline` the card's
    /// comment thread shows (replies included; the detail view nests them).
    var comments: [TimelineEntry] { timeline.filter { $0.isComment } }
    var commentCount: Int { timeline.lazy.filter { $0.kind == .comment }.count }

    /// Past-due and still open → the board flags the date. Mirrors the `overdue`
    /// rule in `TaskCard.svelte`: a `date` earlier than today on a task that is
    /// neither Done nor Cancelled. `date` is a plain `yyyy-MM-dd` string, so a
    /// lexicographic compare against today's UTC date matches the web exactly.
    var isOverdue: Bool {
        guard let date, !date.isEmpty, status != .done, status != .cancelled else { return false }
        return date < BoardTask.todayUTC
    }

    private static var todayUTC: String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f.string(from: Date())
    }

    /// Store/site tags for the card. Prefers the server-extracted list (which
    /// also covers numbers found in the email body); falls back to deriving from
    /// the title for tasks created before that field existed. Mirrors
    /// `TaskCard.svelte`'s `storeNums` (`task.store_numbers ?? extract(title)`).
    var storeNumbers: [String] {
        storeNumbersRaw ?? StoreNumbers.extract(from: title)
    }

    /// True when this card originated from a synced email (has an Exchange id).
    var isFromEmail: Bool { !(exchangeId ?? "").isEmpty }

    /// The origin label's name: the email sender (name → email → "Email") for
    /// synced cards, or the creator ("Manual" if unknown) for manual ones.
    /// Mirrors the `source` derivation in `TaskCard.svelte`.
    var sourceName: String {
        if isFromEmail {
            if let n = senderName, !n.isEmpty { return n }
            if let e = senderEmail, !e.isEmpty { return e }
            return "Email"
        }
        return createdBy.isEmpty ? "Manual" : createdBy
    }

    /// Quote pipeline stage shown on the card; unset → "Draft" (mirrors the
    /// `qStatus` default in `TaskCard.svelte`).
    var quoteStatusLabel: String {
        let s = quoteStatus ?? ""
        return s.isEmpty ? "Draft" : s
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
        timeline = (try? c.decode([TimelineEntry].self, forKey: .timeline)) ?? []
        createdAt = try? c.decode(String.self, forKey: .createdAt)
        updatedAt = try? c.decode(String.self, forKey: .updatedAt)
        storeNumbersRaw = try? c.decode([String].self, forKey: .storeNumbersRaw)
        exchangeId = try? c.decode(String.self, forKey: .exchangeId)
        senderName = try? c.decode(String.self, forKey: .senderName)
        senderEmail = try? c.decode(String.self, forKey: .senderEmail)
        quote = try? c.decode(String.self, forKey: .quote)
        quoteStatus = try? c.decode(String.self, forKey: .quoteStatus)
        po = try? c.decode(String.self, forKey: .po)
    }
}

/// Store / site number extraction (e.g. "D-412", "D412", or a bare "412"),
/// ported verbatim from `src/lib/storeNumbers.ts` so the iOS card tags stores the
/// same way the web card does. Reliable on short, store-focused titles; noisy on
/// full email bodies, which is why the server uses the LLM for those.
enum StoreNumbers {
    // Explicit store references: "D-412", "D 412", "D412" (case-insensitive).
    private static let explicit = try! NSRegularExpression(pattern: #"\bD[-\s]?(\d{3})\b"#, options: [.caseInsensitive])
    // Bare 3-digit numbers not part of a money figure or a longer number.
    private static let bare = try! NSRegularExpression(pattern: #"(?<![,$\d])(\d{3})(?![,\d])"#)

    static func extract(from text: String) -> [String] {
        guard !text.isEmpty else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        var found = Set<String>()
        for re in [explicit, bare] {
            for m in re.matches(in: text, range: range) {
                if let r = Range(m.range(at: 1), in: text) { found.insert(String(text[r])) }
            }
        }
        return found.sorted()
    }
}

#if DEBUG
extension BoardTask {
    /// Memberwise initialiser for SwiftUI previews only. (Production code builds
    /// `BoardTask` via `Decodable`; this DEBUG-only init exists so #Preview blocks
    /// can construct sample data without a network round-trip.)
    init(id: String, title: String, description: String? = nil, assignedTo: String = "", notes: String? = nil,
         date: String? = nil, status: TaskStatus, createdBy: String = "preview",
         attachmentIds: [String] = [], timeline: [TimelineEntry] = [],
         exchangeId: String? = nil, senderName: String? = nil, senderEmail: String? = nil,
         quote: String? = nil, quoteStatus: String? = nil, po: String? = nil) {
        self.id = id
        self.title = title
        self.description = description
        self.assignedTo = assignedTo
        self.notes = notes
        self.date = date
        self.status = status
        self.createdBy = createdBy
        self.attachmentIds = attachmentIds
        self.timeline = timeline
        self.createdAt = nil
        self.updatedAt = nil
        self.storeNumbersRaw = nil
        self.exchangeId = exchangeId
        self.senderName = senderName
        self.senderEmail = senderEmail
        self.quote = quote
        self.quoteStatus = quoteStatus
        self.po = po
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
