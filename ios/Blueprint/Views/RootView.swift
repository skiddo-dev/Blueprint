import SwiftUI

/// Shows the board when signed in, otherwise the login screen. `SessionStore`
/// is `@Observable`, so flipping `isAuthenticated` (after login or sign-out)
/// swaps the view automatically.
struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        #if DEBUG
        // Local-only: `-SCREEN <name>` boots straight into one screen with sample
        // data so individual views can be exercised/screenshotted in the
        // Simulator without driving the full navigation. DEBUG-stripped from release.
        if let screen = DebugScreen.requested {
            DebugScreen.view(for: screen)
        } else {
            main
        }
        #else
        main
        #endif
    }

    @ViewBuilder
    private var main: some View {
        if session.isAuthenticated {
            MainTabView()
        } else {
            LoginView()
        }
    }
}

#if DEBUG
/// Maps the `-SCREEN` launch argument to a view seeded with `BoardTask.samples`.
enum DebugScreen {
    static var requested: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-SCREEN"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    @ViewBuilder
    static func view(for name: String) -> some View {
        switch name {
        case "newtask":
            NewTaskView { _ in }
        case "detail":
            TaskDetailView(task: BoardTask.samples[2], onSave: { _ in }, onDelete: { _ in })
        case "quote":
            QuoteDetailView(quote: Quote.samples[0], onSave: { _ in })
        case "prospect":
            ProspectDetailView(prospect: Prospect.samples[1], onSave: { _ in })
        default:
            Text("Unknown debug screen: \(name)")
        }
    }
}
#endif
