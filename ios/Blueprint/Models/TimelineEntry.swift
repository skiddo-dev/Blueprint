import Foundation

/// One entry in a task's activity log — mirrors `TimelineEntry` in
/// `src/lib/types.ts`. The board's `GET /api/tasks` returns the full task
/// document (see `normalizeTask` in `db.ts`), so every `BoardTask` already
/// carries its `timeline`; the human-posted **comments** are the entries whose
/// `kind == .comment`. System entries (created / email / attachment) round out
/// the history.
///
/// Decoding is defensive in the same spirit as `BoardTask`: a single malformed
/// entry should never blank a task's whole activity log.
struct TimelineEntry: Identifiable, Codable, Hashable {
    /// Stable id for comment entries (the backend stamps a UUID on each). System
    /// entries have no id in the document, so we synthesise one from kind+time
    /// purely for SwiftUI `Identifiable`/`ForEach`; it is never sent back.
    let id: String
    var at: String
    var kind: Kind
    var text: String
    var from: String?          // sender name, for email entries
    var author: String?        // display name of the commenter (comment entries)
    var mentions: [String]     // names @mentioned in a comment
    var authorEmail: String?   // commenter's login email (authz for edit/delete)
    var parentId: String?      // set on a reply → the top-level comment's id
    var editedAt: String?      // set when a comment is edited
    var reactions: [String: [String]]   // emoji → reactor display names

    enum Kind: String, Codable, Hashable {
        case created, email, attachment, system, comment, unknown

        init(from decoder: Decoder) throws {
            let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
            self = Kind(rawValue: raw) ?? .unknown
        }

        /// SF Symbol for the entry's leading glyph in the activity log.
        var symbol: String {
            switch self {
            case .created:    return "sparkles"
            case .email:      return "envelope"
            case .attachment: return "paperclip"
            case .comment:    return "text.bubble"
            case .system, .unknown: return "gearshape"
            }
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, at, kind, text, from, author, mentions
        case authorEmail = "author_email"
        case parentId = "parent_id"
        case editedAt = "edited_at"
        case reactions
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        at = (try? c.decode(String.self, forKey: .at)) ?? ""
        kind = (try? c.decode(Kind.self, forKey: .kind)) ?? .system
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        from = try? c.decode(String.self, forKey: .from)
        author = try? c.decode(String.self, forKey: .author)
        mentions = (try? c.decode([String].self, forKey: .mentions)) ?? []
        authorEmail = try? c.decode(String.self, forKey: .authorEmail)
        parentId = try? c.decode(String.self, forKey: .parentId)
        editedAt = try? c.decode(String.self, forKey: .editedAt)
        reactions = (try? c.decode([String: [String]].self, forKey: .reactions)) ?? [:]
        let decodedId = try? c.decode(String.self, forKey: .id)
        id = decodedId ?? "\(kind.rawValue)-\(at)"
    }

    var isComment: Bool { kind == .comment }
    var isReply: Bool { parentId != nil }
}

#if DEBUG
extension TimelineEntry {
    /// Memberwise initialiser for SwiftUI previews only.
    init(id: String, at: String = "2026-06-06T12:00:00Z", kind: Kind, text: String,
         author: String? = nil, mentions: [String] = [], parentId: String? = nil,
         reactions: [String: [String]] = [:]) {
        self.id = id
        self.at = at
        self.kind = kind
        self.text = text
        self.from = nil
        self.author = author
        self.mentions = mentions
        self.authorEmail = nil
        self.parentId = parentId
        self.editedAt = nil
        self.reactions = reactions
    }
}
#endif
