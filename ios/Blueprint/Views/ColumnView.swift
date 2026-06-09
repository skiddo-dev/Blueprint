import SwiftUI

/// One status column: a header with a count, then a vertically scrolling list
/// of cards. Pull-to-refresh on the card list reloads the whole board.
struct ColumnView: View {
    let status: TaskStatus
    let tasks: [BoardTask]
    let onSelect: (BoardTask) -> Void
    let onRefresh: () async -> Void
    /// Drag-and-drop: a card (carried as its id) was dropped on this column —
    /// move it to `status`.
    var onMove: (String, TaskStatus) async -> Void = { _, _ in }
    /// Store-number filter: the active store (highlights matching chips) and a
    /// tap handler the cards call when their chip is tapped.
    var activeStore: String? = nil
    var onStoreTap: (String) -> Void = { _ in }

    @State private var isTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if tasks.isEmpty {
                emptyState
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 10) {
                        ForEach(tasks) { task in
                            TaskCardView(task: task, activeStore: activeStore, onStoreTap: onStoreTap)
                                .contentShape(Rectangle())
                                .onTapGesture { onSelect(task) }
                                .draggable(task.id)
                        }
                    }
                    .padding(.bottom, 8)
                }
                .refreshable { await onRefresh() }
            }
        }
        .padding(12)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(isTargeted ? status.background : Color.columnSurface,
                    in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(isTargeted ? status.accent : Color.cardBorder,
                              lineWidth: isTargeted ? 2 : 1)
        )
        .dropDestination(for: String.self) { ids, _ in
            for id in ids { Task { await onMove(id, status) } }
            return !ids.isEmpty
        } isTargeted: { isTargeted = $0 }
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
    .background(Color.boardBackground)
}
#endif
