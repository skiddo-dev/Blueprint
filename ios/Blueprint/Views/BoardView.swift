import SwiftUI

struct BoardView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    @State private var tasks: [BoardTask] = []
    @State private var phase: Phase = .loading
    @State private var selected: BoardTask?

    private enum Phase: Equatable {
        case loading, loaded
        case failed(String)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Board")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            Button(role: .destructive) {
                                session.signOut()
                            } label: {
                                Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                            }
                        } label: {
                            Image(systemName: "person.crop.circle")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { Task { await load() } } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
                .sheet(item: $selected) { task in
                    TaskDetailView(task: task) { updated in
                        if let i = tasks.firstIndex(where: { $0.id == updated.id }) {
                            tasks[i] = updated
                        }
                    }
                }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading board…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(hex: 0xE9EDF2))
        case .failed(let message):
            ErrorState(message: message) { await load() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(hex: 0xE9EDF2))
        case .loaded:
            board
        }
    }

    private var board: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(TaskStatus.allCases) { status in
                        ColumnView(
                            status: status,
                            tasks: tasks.filter { $0.status == status },
                            onSelect: { selected = $0 },
                            onRefresh: { await load() }
                        )
                        .frame(width: 290, height: max(geo.size.height - 32, 200))
                    }
                }
                .padding(16)
            }
            .background(Color(hex: 0xE9EDF2))
        }
    }

    @MainActor
    private func load() async {
        guard let base = config.baseURL else {
            phase = .failed("No backend URL configured.")
            return
        }
        if phase != .loaded { phase = .loading }
        do {
            tasks = try await APIClient(baseURL: base).tasks()
            phase = .loaded
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

private struct ErrorState: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("Couldn't load the board").font(.headline)
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await retry() } }
                .buttonStyle(.borderedProminent)
        }
        .padding(32)
    }
}
