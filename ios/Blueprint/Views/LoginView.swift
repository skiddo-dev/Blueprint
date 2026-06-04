import SwiftUI

struct LoginView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @State private var showingAuth = false
    @State private var urlError: String?

    var body: some View {
        @Bindable var config = config
        VStack(spacing: 22) {
            Spacer()
            Image(systemName: "square.stack.3d.up.fill")
                .font(.system(size: 56))
                .foregroundStyle(Color(hex: 0x6366F1))
            VStack(spacing: 4) {
                Text("Blueprint").font(.largeTitle.bold())
                Text("Email-to-Task Kanban").foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("BACKEND URL").font(.caption.bold()).foregroundStyle(.secondary)
                TextField("https://your-app.example.com", text: $config.baseURLString)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .onSubmit(startSignIn)
                if let urlError {
                    Text(urlError).font(.caption).foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 28)

            Button(action: startSignIn) {
                Label("Sign in with Microsoft", systemImage: "person.badge.key.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 28)

            Spacer()
            Spacer()
        }
        .sheet(isPresented: $showingAuth) {
            if let base = config.baseURL {
                AuthSheet(baseURL: base) { session.refresh() }
            }
        }
    }

    private func startSignIn() {
        if config.baseURL == nil {
            urlError = "Enter a valid URL including http:// or https://"
        } else {
            urlError = nil
            showingAuth = true
        }
    }
}
