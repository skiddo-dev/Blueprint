import SwiftUI

@main
struct BlueprintApp: App {
    @State private var config = AppConfig()
    @State private var session = SessionStore()
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(config)
                .environment(session)
                .environment(router)
                .tint(Color(hex: 0x6366F1))
        }
    }
}
