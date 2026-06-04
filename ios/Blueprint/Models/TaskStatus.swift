import SwiftUI

/// The six Kanban statuses, mirroring `KANBAN_STATUSES` / `STATUS_META`
/// in the web app (`src/lib/constants.ts`). The `rawValue` is the exact
/// string the backend stores and returns, so JSON decodes straight into this.
enum TaskStatus: String, CaseIterable, Codable, Hashable, Identifiable {
    case toDo = "To Do"
    case inProgress = "In Progress"
    case review = "Review"
    case done = "Done"
    case onHold = "On Hold"
    case cancelled = "Cancelled"

    var id: String { rawValue }

    /// Strong accent (column header / status pill border).
    var accent: Color {
        switch self {
        case .toDo:       return Color(hex: 0x6366F1)
        case .inProgress: return Color(hex: 0xF59E0B)
        case .review:     return Color(hex: 0x3B82F6)
        case .done:       return Color(hex: 0x10B981)
        case .onHold:     return Color(hex: 0x94A3B8)
        case .cancelled:  return Color(hex: 0xF87171)
        }
    }

    /// Soft background (pill fill).
    var background: Color {
        switch self {
        case .toDo:       return Color(hex: 0xEEF2FF)
        case .inProgress: return Color(hex: 0xFFFBEB)
        case .review:     return Color(hex: 0xDBEAFE)
        case .done:       return Color(hex: 0xD1FAE5)
        case .onHold:     return Color(hex: 0xF1F5F9)
        case .cancelled:  return Color(hex: 0xFEE2E2)
        }
    }

    /// Readable foreground on `background`.
    var textColor: Color {
        switch self {
        case .toDo:       return Color(hex: 0x4338CA)
        case .inProgress: return Color(hex: 0xB45309)
        case .review:     return Color(hex: 0x1D4ED8)
        case .done:       return Color(hex: 0x047857)
        case .onHold:     return Color(hex: 0x475569)
        case .cancelled:  return Color(hex: 0xDC2626)
        }
    }

    var icon: String {
        switch self {
        case .toDo:       return "○"
        case .inProgress: return "◑"
        case .review:     return "◎"
        case .done:       return "●"
        case .onHold:     return "⊘"
        case .cancelled:  return "✕"
        }
    }
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
