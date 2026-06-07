import SwiftUI

/// Create a task (`POST /api/tasks`). Only `title` is required; the server
/// stamps creator identity and derives store numbers from the title. On success
/// the created `BoardTask` is handed back so the board shows it immediately.
struct NewTaskView: View {
    let onCreate: (BoardTask) -> Void

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var assignee = ""
    @State private var date = ""
    @State private var status: TaskStatus = .toDo
    @State private var notes = ""
    @State private var saving = false
    @State private var errorMessage: String?

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !saving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("What needs doing?", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(TaskStatus.allCases) { option in
                            Text("\(option.icon)  \(option.rawValue)").tag(option)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Details") {
                    TextField("Assignee", text: $assignee)
                        .textInputAutocapitalization(.words)
                    TextField("Date (e.g. 2026-06-30)", text: $date)
                        .autocorrectionDisabled()
                }

                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 90)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.callout).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await save() } }.disabled(!canSave)
                }
            }
            .disabled(saving)
            .overlay { if saving { ProgressView().controlSize(.large) } }
        }
    }

    @MainActor
    private func save() async {
        guard let base = config.baseURL else {
            errorMessage = "No backend URL configured."
            return
        }
        saving = true
        errorMessage = nil
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = NewTask(
            title: trimmed,
            status: status.rawValue,
            assigned_to: assignee.isEmpty ? nil : assignee,
            date: date.isEmpty ? nil : date,
            notes: notes.isEmpty ? nil : notes
        )
        do {
            let created = try await APIClient(baseURL: base).createTask(body)
            saving = false
            onCreate(created)
            dismiss()
        } catch APIClient.APIError.notAuthenticated {
            saving = false
            session.signOut()
        } catch {
            saving = false
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
#Preview("New task") {
    NewTaskView { _ in }
        .environment(AppConfig())
        .environment(SessionStore())
}
#endif
