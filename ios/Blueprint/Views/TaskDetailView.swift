import SwiftUI

/// Edit a single task. Only changed fields are PATCHed (one request per field,
/// matching the backend's `{ field, value }` contract). On success the updated
/// task is handed back so the board reflects it without a full reload.
struct TaskDetailView: View {
    let task: BoardTask
    let onSave: (BoardTask) -> Void
    let onDelete: (BoardTask) -> Void

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var status: TaskStatus
    @State private var assignee: String
    @State private var date: String
    @State private var notes: String
    @State private var saving = false
    @State private var deleting = false
    @State private var showDeleteConfirm = false
    @State private var errorMessage: String?

    init(task: BoardTask,
         onSave: @escaping (BoardTask) -> Void,
         onDelete: @escaping (BoardTask) -> Void = { _ in }) {
        self.task = task
        self.onSave = onSave
        self.onDelete = onDelete
        _status = State(initialValue: task.status)
        _assignee = State(initialValue: task.assignedTo)
        _date = State(initialValue: task.date ?? "")
        _notes = State(initialValue: task.notes ?? "")
    }

    /// Non-comment timeline entries (created / email / attachment), newest first.
    private var activity: [TimelineEntry] {
        task.timeline.filter { !$0.isComment }.reversed()
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

                Section("Comments\(task.commentCount > 0 ? " (\(task.commentCount))" : "")") {
                    CommentsView(taskId: task.id, comments: task.comments)
                }

                if !activity.isEmpty {
                    Section("Activity") {
                        ForEach(activity) { entry in
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.text).font(.callout)
                                    Text(CommentsView.relative(entry.at))
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: entry.kind.symbol).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.callout).foregroundStyle(.red)
                    }
                }

                Section {
                    Button(role: .destructive) { showDeleteConfirm = true } label: {
                        Label("Delete Task", systemImage: "trash")
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    .disabled(deleting)
                }
            }
            .confirmationDialog("Delete this task?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete Task", role: .destructive) { Task { await delete() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently removes \"\(task.title)\".")
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
            .disabled(saving || deleting)
            .overlay {
                if saving || deleting {
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

    @MainActor
    private func delete() async {
        guard let base = config.baseURL else {
            errorMessage = "No backend URL configured."
            return
        }
        deleting = true
        errorMessage = nil
        do {
            try await APIClient(baseURL: base).deleteTask(id: task.id)
            deleting = false
            onDelete(task)
            dismiss()
        } catch APIClient.APIError.notAuthenticated {
            deleting = false
            session.signOut()
        } catch {
            deleting = false
            errorMessage = error.localizedDescription
        }
    }
}

#if DEBUG
#Preview("Task detail") {
    TaskDetailView(task: BoardTask.samples[2]) { _ in }
        .environment(AppConfig())
        .environment(SessionStore())
}
#endif
