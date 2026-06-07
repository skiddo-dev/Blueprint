import SwiftUI

/// Global search (`GET /api/search`). Results are role-scoped server-side
/// (admins get tasks + quotes + prospects; others get their own tasks). Tapping
/// a task result jumps to the Board and opens it; quote/prospect results switch
/// to that tab.
struct SearchView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    @State private var query: String = {
        #if DEBUG
        // Local-only: `-QUERY <text>` pre-fills the field so search results can be
        // screenshotted in the Simulator (paired with `-FAKE_AUTH -TAB search`).
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-QUERY"), i + 1 < args.count { return args[i + 1] }
        #endif
        return ""
    }()
    @State private var results = SearchResults.empty
    @State private var searching = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if let errorMessage {
                    ContentUnavailableView {
                        Label("Search failed", systemImage: "exclamationmark.triangle")
                    } description: { Text(errorMessage) }
                } else if query.trimmingCharacters(in: .whitespaces).count < 2 {
                    ContentUnavailableView("Search Blueprint", systemImage: "magnifyingglass",
                                           description: Text("Find tasks, quotes, and prospects."))
                } else if results.isEmpty {
                    if searching {
                        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ContentUnavailableView.search(text: query)
                    }
                } else {
                    resultsList
                }
            }
            .navigationTitle("Search")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "Tasks, quotes, prospects")
        }
        .task(id: query) { await runSearch() }
    }

    private var resultsList: some View {
        List {
            section("Tasks", icon: "checklist", hits: results.tasks)
            section("Quotes", icon: "doc.text", hits: results.quotes)
            section("Prospects", icon: "building.2", hits: results.prospects)
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func section(_ title: String, icon: String, hits: [SearchHit]) -> some View {
        if !hits.isEmpty {
            Section(title) {
                ForEach(hits) { hit in
                    Button { open(hit) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: icon).foregroundStyle(.secondary).frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(hit.title).font(.subheadline).lineLimit(1)
                                if let subtitle = hit.subtitle, !subtitle.isEmpty {
                                    Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func open(_ hit: SearchHit) {
        switch hit.type {
        case "task":     router.openTask(hit.id)
        case "quote":    router.selectedTab = .quotes
        case "prospect": router.selectedTab = .prospects
        default:         break
        }
    }

    @MainActor
    private func runSearch() async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { results = .empty; searching = false; return }
        // Debounce: `.task(id: query)` cancels the previous run on each keystroke,
        // so this sleep collapses rapid typing into one request.
        try? await Task.sleep(nanoseconds: 300_000_000)
        if Task.isCancelled { return }
        guard let base = config.baseURL else { errorMessage = "No backend URL configured."; return }
        searching = true
        do {
            let r = try await APIClient(baseURL: base).search(q)
            if Task.isCancelled { return }
            results = r
            errorMessage = nil
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            if !Task.isCancelled { errorMessage = error.localizedDescription }
        }
        searching = false
    }
}

#if DEBUG
#Preview("Search") {
    SearchView()
        .environment(AppConfig())
        .environment(SessionStore())
        .environment(AppRouter())
}
#endif
