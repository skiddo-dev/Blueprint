import SwiftUI

struct TaskCardView: View {
    let task: BoardTask

    var body: some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(task.status.accent)
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 8) {
                Text(task.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let date = task.date, !date.isEmpty {
                    Label(date, systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack {
                    if !task.assignedTo.isEmpty {
                        Label(task.assignedTo, systemImage: "person.fill")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    StatusPill(status: task.status)
                }
            }
            .padding(12)
        }
        .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: 0xE2E8F0)))
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

#if DEBUG
#Preview("Cards") {
    VStack(spacing: 12) {
        TaskCardView(task: BoardTask.samples[0])
        TaskCardView(task: BoardTask.samples[2])
        TaskCardView(task: BoardTask.samples[4])
    }
    .padding()
    .background(Color(hex: 0xE9EDF2))
}
#endif
