import SwiftUI

struct BoardView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    @State private var tasks: [BoardTask] = []
    @State private var phase: Phase = .loading
    @State private var selected: BoardTask?
    @State private var showNewTask = false
    @State private var showClearConfirm = false
    @State private var offline = false
    @State private var syncing = false
    @State private var syncMessage: String?
    @State private var showSync = false
    /// Tapping a card's store-number chip filters the whole board to that store;
    /// tapping it again (or the banner) clears it. Mirrors the web card's filter.
    @State private var activeStore: String?

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
                            if let name = session.displayName {
                                Section(name) {
                                    if session.isAdmin {
                                        Button { Task { await sync() } } label: {
                                            Label("Sync email", systemImage: "arrow.triangle.2.circlepath")
                                        }
                                        .disabled(syncing)
                                        Button(role: .destructive) { showClearConfirm = true } label: {
                                            Label("Clear all tasks", systemImage: "trash")
                                        }
                                    }
                                    Button(role: .destructive) { session.signOut() } label: {
                                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                                    }
                                }
                            } else {
                                Button(role: .destructive) { session.signOut() } label: {
                                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                                }
                            }
                        } label: {
                            Image(systemName: "person.crop.circle")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showNewTask = true } label: {
                            Image(systemName: "plus")
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
                    } onDelete: { removed in
                        tasks.removeAll { $0.id == removed.id }
                    }
                }
                .sheet(isPresented: $showNewTask) {
                    NewTaskView { created in
                        tasks.insert(created, at: 0)
                    }
                }
                .confirmationDialog("Clear all tasks?", isPresented: $showClearConfirm, titleVisibility: .visible) {
                    Button("Delete all tasks", role: .destructive) { Task { await clearAll() } }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("This permanently deletes every task on the board. This cannot be undone.")
                }
                .alert("Email sync", isPresented: $showSync, presenting: syncMessage) { _ in
                    Button("OK", role: .cancel) {}
                } message: { Text($0) }
                .safeAreaInset(edge: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        if offline {
                            Label("Offline — showing the last saved board", systemImage: "wifi.slash")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                                .background(Color(hex: 0x64748B))
                        }
                        if let store = activeStore {
                            Button { activeStore = nil } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "line.3.horizontal.decrease.circle.fill")
                                    Text("Filtering store #\(store)")
                                    Spacer(minLength: 6)
                                    Text("Clear")
                                    Image(systemName: "xmark.circle.fill")
                                }
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(Color(hex: 0x6366F1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
        }
        .task { await load() }
        .onChange(of: router.pendingTaskID) { openPendingIfNeeded() }
    }

    /// If search asked to open a task, show it once it's in our loaded set.
    private func openPendingIfNeeded() {
        guard let pid = router.pendingTaskID,
              let task = tasks.first(where: { $0.id == pid }) else { return }
        selected = task
        router.pendingTaskID = nil
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading board…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.boardBackground)
        case .failed(let message):
            ErrorState(message: message) { await load() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.boardBackground)
        case .loaded:
            board
        }
    }

    /// The board, after applying the active store-number filter (if any).
    private var visibleTasks: [BoardTask] {
        guard let store = activeStore else { return tasks }
        return tasks.filter { $0.storeNumbers.contains(store) }
    }

    private func toggleStore(_ n: String) {
        activeStore = (activeStore == n) ? nil : n
    }

    private var board: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(TaskStatus.allCases) { status in
                        ColumnView(
                            status: status,
                            tasks: visibleTasks.filter { $0.status == status },
                            onSelect: { selected = $0 },
                            onRefresh: { await load() },
                            onMove: { id, target in await move(taskId: id, to: target) },
                            activeStore: activeStore,
                            onStoreTap: { toggleStore($0) }
                        )
                        .frame(width: 290, height: max(geo.size.height - 32, 200))
                    }
                }
                .padding(16)
            }
            .background(Color.boardBackground)
        }
    }

    @MainActor
    private func load() async {
        guard let base = config.baseURL else {
            phase = .failed("No backend URL configured.")
            return
        }
        // Instant cold-start: paint the cached board while the fresh fetch runs.
        if tasks.isEmpty, let cached = BoardCache.load() {
            tasks = cached
            phase = .loaded
            offline = true
        } else if phase != .loaded {
            phase = .loading
        }
        do {
            let fresh = try await APIClient(baseURL: base).tasks()
            tasks = fresh
            offline = false
            phase = .loaded
            BoardCache.save(fresh)
            openPendingIfNeeded()
            // Best-effort: learn the signed-in user's role so admin-only actions
            // (Clear all / Sync) can be shown. Never blocks or fails the board load.
            await session.loadUser(baseURL: base)
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            // Keep showing whatever we have (cache) and flag it; only hard-fail
            // when there's nothing to show.
            if tasks.isEmpty {
                phase = .failed(error.localizedDescription)
            } else {
                offline = true
            }
        }
    }

    /// Move a card to another column via drag-and-drop: optimistic locally, then
    /// PATCH the status; revert on failure.
    @MainActor
    private func move(taskId: String, to status: TaskStatus) async {
        guard let base = config.baseURL,
              let i = tasks.firstIndex(where: { $0.id == taskId }),
              tasks[i].status != status else { return }
        let previous = tasks[i].status
        tasks[i].status = status
        do {
            try await APIClient(baseURL: base).update(taskId: taskId, field: "status", value: status.rawValue)
            BoardCache.save(tasks)
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            if let j = tasks.firstIndex(where: { $0.id == taskId }) { tasks[j].status = previous }
        }
    }

    /// Trigger an email sync (admin), then refresh the board to surface new cards.
    @MainActor
    private func sync() async {
        guard let base = config.baseURL else { return }
        syncing = true
        do {
            let result = try await APIClient(baseURL: base).syncEmail()
            syncMessage = result.message
            showSync = true
            await load()
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            syncMessage = error.localizedDescription
            showSync = true
        }
        syncing = false
    }

    @MainActor
    private func clearAll() async {
        guard let base = config.baseURL else { return }
        do {
            try await APIClient(baseURL: base).clearAllTasks()
            await load()
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
