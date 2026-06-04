import SwiftUI

/// One status column: a header with a count, then a vertically scrolling list
/// of cards. Pull-to-refresh on the card list reloads the whole board.
struct ColumnView: View {
    let status: TaskStatus
    let tasks: [BoardTask]
    let onSelect: (BoardTask) -> Void
    let onRefresh: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if tasks.isEmpty {
                emptyState
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 10) {
                        ForEach(tasks) { task in
                            TaskCardView(task: task)
                                .contentShape(Rectangle())
                                .onTapGesture { onSelect(task) }
                        }
                    }
                    .padding(.bottom, 8)
                }
                .refreshable { await onRefresh() }
            }
        }
        .padding(12)
        .background(Color(hex: 0xF8FAFC), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color(hex: 0xE2E8F0)))
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text(status.icon).foregroundStyle(status.accent)
            Text(status.rawValue).font(.headline)
            Spacer()
            Text("\(tasks.count)")
                .font(.caption.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(status.background, in: Capsule())
                .foregroundStyle(status.textColor)
        }
    }

    private var emptyState: some View {
        Text("No tasks")
            .font(.caption)
            .foregroundStyle(.tertiary)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 24)
    }
}

#if DEBUG
#Preview("Column") {
    ColumnView(
        status: .toDo,
        tasks: BoardTask.samples.filter { $0.status == .toDo },
        onSelect: { _ in },
        onRefresh: {}
    )
    .frame(width: 290, height: 560)
    .padding()
    .background(Color(hex: 0xE9EDF2))
}
#endif
