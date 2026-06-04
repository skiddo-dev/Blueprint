import SwiftUI

/// Shows the board when signed in, otherwise the login screen. `SessionStore`
/// is `@Observable`, so flipping `isAuthenticated` (after login or sign-out)
/// swaps the view automatically.
struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        if session.isAuthenticated {
            BoardView()
        } else {
            LoginView()
        }
    }
}
