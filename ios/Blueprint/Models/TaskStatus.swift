import SwiftUI
import UIKit

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

    /// A Color that tracks the system appearance — `light` in light mode, `dark`
    /// in dark mode — so the board's custom surfaces follow Light/Dark/System the
    /// way the web app's themed tokens do. Light values preserve the original
    /// palette (no light-mode change); dark values form a slate hierarchy where
    /// the page is darkest and cards are the most-raised surface.
    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        func ui(_ hex: UInt32) -> UIColor {
            UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255.0,
                    green: CGFloat((hex >> 8) & 0xFF) / 255.0,
                    blue: CGFloat(hex & 0xFF) / 255.0, alpha: 1.0)
        }
        return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? ui(dark) : ui(light) })
    }

    /// The board page, behind the columns.
    static let boardBackground = adaptive(light: 0xE9EDF2, dark: 0x0B1120)
    /// A column's container fill.
    static let columnSurface = adaptive(light: 0xF8FAFC, dark: 0x141D2E)
    /// A task card's fill — the most-raised surface.
    static let cardSurface = adaptive(light: 0xFFFFFF, dark: 0x1C2740)
    /// Hairline border for cards and columns.
    static let cardBorder = adaptive(light: 0xE2E8F0, dark: 0x2C3A52)
    /// A calm, muted rose for an overdue date — a nudge, not an alarm. Matches the
    /// web's `#b06a72`; brightened in dark mode so it stays legible on dark cards.
    static let overdueDate = adaptive(light: 0xB06A72, dark: 0xE89AA0)
    /// The deep blue of a store-number tag (web `.store-tag`, `#1e3a8a`);
    /// brightened in dark mode so the chip keeps its pop on a dark card.
    static let storeTag = adaptive(light: 0x1E3A8A, dark: 0x3E5BB8)
}
