import SwiftUI

/// The signed-in app shell. Board + Search are available to everyone; Dashboard,
/// Quotes and Prospects are admin-only (mirroring the page guard in
/// hooks.server.ts), so they appear once the role is known. Tab selection and
/// cross-tab deep links flow through `AppRouter`.
struct MainTabView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedTab) {
            BoardView()
                .tabItem { Label("Board", systemImage: "rectangle.split.3x1") }
                .tag(AppTab.board)

            if session.isAdmin {
                DashboardView()
                    .tabItem { Label("Dashboard", systemImage: "chart.bar.fill") }
                    .tag(AppTab.dashboard)

                QuotesView()
                    .tabItem { Label("Quotes", systemImage: "doc.text.fill") }
                    .tag(AppTab.quotes)

                ProspectsView()
                    .tabItem { Label("Prospects", systemImage: "building.2.fill") }
                    .tag(AppTab.prospects)
            }

            SearchView()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(AppTab.search)
        }
        .task {
            // Learn the role early so the admin tabs appear without waiting for
            // the board's own load. Best-effort.
            if let base = config.baseURL { await session.loadUser(baseURL: base) }
        }
    }
}
