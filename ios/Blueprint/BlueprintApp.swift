import SwiftUI

@main
struct BlueprintApp: App {
    @State private var config = AppConfig()
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(config)
                .environment(session)
                .tint(Color(hex: 0x6366F1))
        }
    }
}
