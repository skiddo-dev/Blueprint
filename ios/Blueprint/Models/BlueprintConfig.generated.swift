// GENERATED — DO NOT EDIT BY HAND.
//
// Swift mirror of the shared UI constants in `src/lib/constants.ts` (the flat
// constant tables of `GET /api/config`). Regenerate from the repo root with:
//
//     npm run gen:ios
//
// Hand edits will be overwritten on the next generate.

enum BlueprintConfig {
    struct StatusMeta { let color: UInt32; let bg: UInt32; let text: UInt32; let icon: String }
    struct QuoteStatusMeta { let color: UInt32; let bg: UInt32; let text: UInt32 }
    struct ProspectStatusMeta { let label: String; let color: UInt32; let bg: UInt32; let text: UInt32 }

    /// Kanban statuses in board order.
    static let taskStatuses: [String] = ["To Do", "In Progress", "Review", "Done", "On Hold", "Cancelled"]

    /// Per-status colours + glyph, keyed by the backend status string.
    static let statusMeta: [String: StatusMeta] = [
        "To Do": StatusMeta(color: 0x6366F1, bg: 0xEEF2FF, text: 0x4338CA, icon: "○"),
        "In Progress": StatusMeta(color: 0xF59E0B, bg: 0xFFFBEB, text: 0xB45309, icon: "◑"),
        "Review": StatusMeta(color: 0x3B82F6, bg: 0xDBEAFE, text: 0x1D4ED8, icon: "◎"),
        "Done": StatusMeta(color: 0x10B981, bg: 0xD1FAE5, text: 0x047857, icon: "●"),
        "On Hold": StatusMeta(color: 0x94A3B8, bg: 0xF1F5F9, text: 0x475569, icon: "⊘"),
        "Cancelled": StatusMeta(color: 0xF87171, bg: 0xFEE2E2, text: 0xDC2626, icon: "✕"),
    ]

    static let quoteTypes: [String] = ["Assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"]
    static let quotePeople: [String] = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"]
    static let quoteContacts: [String] = ["Alex Edge", "Jeff Bindus", "Cody Vantrease", "Zach Hanf", "Malachi Mosley", "Carl Regner", "Jack Torrance", "Tyler Washington", "Kyle Semak", "Micah Blackmon", "Jack Kristensen", "Ken Kardel", "Ken Reisig"]
    static let quoteWorkTypes: [String] = ["Extras", "Misc. Work", "Front End Work", "Minor Remodel", "Pick Up Expansion", "Top Stock", "Freezer", "Center Store", "SCOS", "Remodel", "Minor Capital", "Credit", "Cart Corral", "RX Counsel Room", "Nat Food Int", "Paint and Putty", "Reset", "Starbucks"]
    static let supervisors: [String] = ["Ben", "Kris", "Vlad", "Bogdan", "Frank Crew"]
    static let quoteStatuses: [String] = ["Draft", "Sent", "Won", "Lost"]

    static let quoteStatusMeta: [String: QuoteStatusMeta] = [
        "Draft": QuoteStatusMeta(color: 0x94A3B8, bg: 0xF1F5F9, text: 0x475569),
        "Sent": QuoteStatusMeta(color: 0x3B82F6, bg: 0xDBEAFE, text: 0x1D4ED8),
        "Won": QuoteStatusMeta(color: 0x10B981, bg: 0xD1FAE5, text: 0x047857),
        "Lost": QuoteStatusMeta(color: 0xEF4444, bg: 0xFEE2E2, text: 0xDC2626),
    ]

    /// Flow signals (board V2): days in an active column before the aging
    /// chip turns amber / rose; soft per-status WIP limits (advisory); days
    /// after which finished cards auto-archive. Same values as /api/config.
    static let agingWarnDays: Int = 7
    static let agingAlertDays: Int = 14
    static let wipLimits: [String: Int] = [
        "In Progress": 5,
        "Review": 4,
    ]
    static let archiveAfterDays: Int = 30

    static let prospectStatuses: [String] = ["new", "contacted", "qualified", "dead"]

    static let prospectStatusMeta: [String: ProspectStatusMeta] = [
        "new": ProspectStatusMeta(label: "New", color: 0x6366F1, bg: 0xEEF2FF, text: 0x4338CA),
        "contacted": ProspectStatusMeta(label: "Contacted", color: 0xF59E0B, bg: 0xFFFBEB, text: 0xB45309),
        "qualified": ProspectStatusMeta(label: "Qualified", color: 0x10B981, bg: 0xD1FAE5, text: 0x047857),
        "dead": ProspectStatusMeta(label: "Dead", color: 0x94A3B8, bg: 0xF1F5F9, text: 0x475569),
    ]
}
