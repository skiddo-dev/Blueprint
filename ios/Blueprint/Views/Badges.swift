import SwiftUI

// ── Quote outcome (won / lost / open) ────────────────────────────────────────
// The quote *row* outcome is the dashboard win/loss state — distinct from the
// task-side `quote_status` meta (Draft/Sent/Won/Lost), so its palette lives here.
enum QuoteOutcome {
    static let order = ["open", "won", "lost"]

    static func color(_ status: String) -> Color {
        switch status {
        case "won":  return Color(hex: 0x10B981)
        case "lost": return Color(hex: 0xEF4444)
        default:     return Color(hex: 0x3B82F6)
        }
    }

    static func label(_ status: String) -> String { status.capitalized }
}

struct OutcomePill: View {
    let status: String
    var body: some View {
        Text(QuoteOutcome.label(status))
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(QuoteOutcome.color(status).opacity(0.16), in: Capsule())
            .foregroundStyle(QuoteOutcome.color(status))
    }
}

// ── Prospect pipeline status (new / contacted / qualified / dead) ─────────────
// Colours come from the generated config (single source of truth: constants.ts).
enum PipelineStatus {
    static let order = ["new", "contacted", "qualified", "dead"]

    static func meta(_ status: String) -> BlueprintConfig.ProspectStatusMeta {
        BlueprintConfig.prospectStatusMeta[status]
            ?? BlueprintConfig.ProspectStatusMeta(label: status.capitalized, color: 0x94A3B8, bg: 0xF1F5F9, text: 0x475569)
    }
}

struct PipelinePill: View {
    let status: String
    var body: some View {
        let m = PipelineStatus.meta(status)
        Text(m.label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color(hex: m.bg), in: Capsule())
            .foregroundStyle(Color(hex: m.text))
    }
}
