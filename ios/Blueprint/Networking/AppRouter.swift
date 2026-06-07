import Foundation
import Observation

/// The app's top-level tabs.
enum AppTab: Hashable {
    case board, dashboard, quotes, prospects, search
}

/// Drives tab selection and cross-tab deep links. Injected into the SwiftUI
/// environment from `BlueprintApp`. Search uses it to jump to the Board tab and
/// open a specific task; the Board observes `pendingTaskID` and opens it once its
/// tasks are loaded, then clears it.
@Observable
final class AppRouter {
    var selectedTab: AppTab = .board

    /// A task id the Board should open as soon as it can resolve it. Set by
    /// search; cleared by the Board after it opens (or fails to find) the task.
    var pendingTaskID: String?

    /// Switch to the Board tab and request it open `taskID`.
    func openTask(_ taskID: String) {
        pendingTaskID = taskID
        selectedTab = .board
    }

    init() {
        #if DEBUG
        // Local-only: `-TAB <name>` boots into a specific tab so each section can
        // be screenshotted in the Simulator (paired with `-FAKE_AUTH`).
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-TAB"), i + 1 < args.count {
            switch args[i + 1] {
            case "dashboard": selectedTab = .dashboard
            case "quotes":    selectedTab = .quotes
            case "prospects": selectedTab = .prospects
            case "search":    selectedTab = .search
            default:          break
            }
        }
        #endif
    }
}
