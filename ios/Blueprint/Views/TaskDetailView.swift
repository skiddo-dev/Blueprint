import SwiftUI

/// Edit a single task. Only changed fields are PATCHed (one request per field,
/// matching the backend's `{ field, value }` contract). On success the updated
/// task is handed back so the board reflects it without a full reload.
struct TaskDetailView: View {
    let task: BoardTask
    let onSave: (BoardTask) -> Void

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var status: TaskStatus
    @State private var assignee: String
    @State private var date: String
    @State private var notes: String
    @State private var saving = false
    @State private var errorMessage: String?

    init(task: BoardTask, onSave: @escaping (BoardTask) -> Void) {
        self.task = task
        self.onSave = onSave
        _status = State(initialValue: task.status)
        _assignee = State(initialValue: task.assignedTo)
        _date = State(initialValue: task.date ?? "")
        _notes = State(initialValue: task.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    Text(task.title).font(.headline)
                    if let description = task.description, !description.isEmpty {
                        Text(description).font(.subheadline).foregroundStyle(.secondary)
                    }
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
                    TextEditor(text: $notes).frame(minHeight: 110)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.callout).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Edit Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(saving)
                }
            }
            .disabled(saving)
            .overlay {
                if saving {
                    ProgressView().controlSize(.large)
                }
            }
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
        let client = APIClient(baseURL: base)
        do {
            if status != task.status {
                try await client.update(taskId: task.id, field: "status", value: status.rawValue)
            }
            if assignee != task.assignedTo {
                try await client.update(taskId: task.id, field: "assigned_to", value: assignee)
            }
            if date != (task.date ?? "") {
                try await client.update(taskId: task.id, field: "date", value: date)
            }
            if notes != (task.notes ?? "") {
                try await client.update(taskId: task.id, field: "notes", value: notes)
            }

            var updated = task
            updated.status = status
            updated.assignedTo = assignee
            updated.date = date.isEmpty ? nil : date
            updated.notes = notes.isEmpty ? nil : notes

            saving = false
            onSave(updated)
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
