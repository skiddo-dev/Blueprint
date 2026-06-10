import SwiftUI

struct TaskCardView: View {
    let task: BoardTask
    /// The store currently filtering the board (highlights its chip), and a tap
    /// handler for the chips. Both optional so previews/non-board uses still work.
    var activeStore: String? = nil
    var onStoreTap: ((String) -> Void)? = nil

    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(task.status.accent)
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 8) {
                Text(task.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !task.storeNumbers.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(task.storeNumbers, id: \.self) { n in
                            let isActive = (n == activeStore)
                            Button { onStoreTap?(n) } label: {
                                Text("#\(n)")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(isActive ? Color(hex: 0x6366F1) : Color.storeTag,
                                                in: RoundedRectangle(cornerRadius: 4))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 4)
                                            .strokeBorder(Color(hex: 0x6366F1).opacity(isActive ? 0.55 : 0), lineWidth: 2)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let summary = task.description, !summary.isEmpty {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let po = task.po, !po.isEmpty {
                    Text("🧾 PO \(po)")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Color(hex: 0xECFDF5), in: RoundedRectangle(cornerRadius: 4))
                        .foregroundStyle(Color(hex: 0x047857))
                }

                if let quote = task.quote, !quote.isEmpty {
                    QuoteChip(amount: quote, status: task.quoteStatusLabel)
                }

                HStack(spacing: 8) {
                    if let date = task.date, !date.isEmpty {
                        Label(date, systemImage: task.isOverdue ? "calendar.badge.exclamationmark" : "calendar")
                            .font(.caption)
                            .foregroundStyle(task.isOverdue ? Color.overdueDate : Color.secondary)
                    }
                    if task.aging != .none {
                        // ⏳ days-in-column — amber past warn, rose past alert
                        // (mirrors the web's aging chip; thresholds from config).
                        Label("\(task.daysInColumn)d", systemImage: "hourglass")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(task.aging == .alert ? Color(hex: 0xB06A72) : Color(hex: 0x92670E))
                    }
                }

                Label {
                    Text(task.sourceName)
                } icon: {
                    Image(systemName: task.isFromEmail ? "envelope.fill" : "pencil")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)

                HStack(spacing: 8) {
                    if !task.assignedTo.isEmpty {
                        // Primary assignee, with a +N for co-assignees (full
                        // names in the detail sheet).
                        Label(task.coAssignees.isEmpty ? task.assignedTo : "\(task.assignedTo) +\(task.coAssignees.count)",
                              systemImage: task.coAssignees.isEmpty ? "person.fill" : "person.2.fill")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if !task.checklist.isEmpty {
                        Label("\(task.checklistDone)/\(task.checklist.count)", systemImage: "checklist")
                            .font(.caption2)
                            .foregroundStyle(task.checklistDone == task.checklist.count
                                             ? Color(hex: 0x10B981) : Color.secondary)
                    }
                    if task.commentCount > 0 {
                        Label("\(task.commentCount)", systemImage: "text.bubble")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if !task.attachmentIds.isEmpty {
                        Label("\(task.attachmentIds.count)", systemImage: "paperclip")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 6)
                    StatusPill(status: task.status)
                }
            }
            .padding(12)
        }
        .background(Color.cardSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.cardBorder))
        .shadow(color: Color.black.opacity(0.04), radius: 3, y: 1)
    }
}

struct StatusPill: View {
    let status: TaskStatus
    var body: some View {
        Text(status.rawValue)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.background, in: Capsule())
            .foregroundStyle(status.textColor)
    }
}

/// A "💰 amount" chip with a pipeline-status badge (Draft/Sent/Won/Lost),
/// coloured from the generated `quoteStatusMeta` — the same source the web card
/// uses, so the badge palette stays in sync.
struct QuoteChip: View {
    let amount: String
    let status: String
    var body: some View {
        let m = BlueprintConfig.quoteStatusMeta[status]
            ?? BlueprintConfig.QuoteStatusMeta(color: 0x94A3B8, bg: 0xF1F5F9, text: 0x475569)
        HStack(spacing: 5) {
            Text("💰 \(amount)")
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
            Text(status)
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(Color(hex: m.bg), in: Capsule())
                .foregroundStyle(Color(hex: m.text))
        }
    }
}

#if DEBUG
#Preview("Cards") {
    VStack(spacing: 12) {
        TaskCardView(task: BoardTask.samples[0])
        TaskCardView(task: BoardTask.samples[2])
        TaskCardView(task: BoardTask.samples[4])
    }
    .padding()
    .background(Color.boardBackground)
}
#endif
