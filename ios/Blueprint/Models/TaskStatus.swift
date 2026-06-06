import SwiftUI

/// The six Kanban statuses, mirroring `KANBAN_STATUSES` in the web app
/// (`src/lib/constants.ts`). The `rawValue` is the exact string the backend
/// stores and returns, so JSON decodes straight into this. Per-status colours
/// and glyphs come from the generated `BlueprintConfig.statusMeta`, kept in
/// sync with the web app via `npm run gen:ios` (never hand-edit them here).
enum TaskStatus: String, CaseIterable, Codable, Hashable, Identifiable {
    case toDo = "To Do"
    case inProgress = "In Progress"
    case review = "Review"
    case done = "Done"
    case onHold = "On Hold"
    case cancelled = "Cancelled"

    var id: String { rawValue }

    /// Generated colours + glyph for this status (single source of truth:
    /// `src/lib/constants.ts` → `BlueprintConfig.generated.swift`). Falls back
    /// to a neutral slate only if the status string is ever missing from the
    /// generated table — which would mean the enum and the generator drifted.
    private var meta: BlueprintConfig.StatusMeta {
        BlueprintConfig.statusMeta[rawValue]
            ?? BlueprintConfig.StatusMeta(color: 0x94A3B8, bg: 0xF1F5F9, text: 0x475569, icon: "•")
    }

    /// Strong accent (column header / status pill border).
    var accent: Color { Color(hex: meta.color) }

    /// Soft background (pill fill).
    var background: Color { Color(hex: meta.bg) }

    /// Readable foreground on `background`.
    var textColor: Color { Color(hex: meta.text) }

    var icon: String { meta.icon }
}

extension Color {
    /// Build a Color from a 0xRRGGBB integer literal.
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
