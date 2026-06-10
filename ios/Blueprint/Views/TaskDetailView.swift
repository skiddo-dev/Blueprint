import SwiftUI
import UniformTypeIdentifiers
import QuickLook

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
    @State private var coAssignees: [String]
    @State private var newCoAssignee = ""
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
        _coAssignees = State(initialValue: task.coAssignees)
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

                // Co-assignees — extra people on the task (assigned_to stays
                // primary). Saved with the other fields on Save; the server
                // resolves names to identities so My Work follows.
                Section("Also assigned") {
                    ForEach(coAssignees, id: \.self) { name in
                        HStack {
                            Label(name, systemImage: "person.2")
                            Spacer()
                            Button(role: .destructive) {
                                coAssignees.removeAll { $0 == name }
                            } label: {
                                Image(systemName: "minus.circle").foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    HStack {
                        TextField("Add person", text: $newCoAssignee)
                            .textInputAutocapitalization(.words)
                            .onSubmit(addCoAssignee)
                        Button(action: addCoAssignee) {
                            Image(systemName: "plus.circle.fill")
                        }
                        .buttonStyle(.plain)
                        .disabled(newCoAssignee.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                Section("Checklist\(task.checklist.isEmpty ? "" : " (\(task.checklistDone)/\(task.checklist.count))")") {
                    ChecklistSectionView(taskId: task.id, items: task.checklist)
                }

                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 110)
                }

                Section("Attachments") {
                    AttachmentsView(taskId: task.id, attachments: task.attachmentList)
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
            if coAssignees != task.coAssignees {
                try await client.update(taskId: task.id, field: "co_assignees", value: coAssignees)
            }

            var updated = task
            updated.status = status
            updated.assignedTo = assignee
            updated.date = date.isEmpty ? nil : date
            updated.notes = notes.isEmpty ? nil : notes
            updated.coAssignees = coAssignees

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

    private func addCoAssignee() {
        let name = newCoAssignee.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !coAssignees.contains(name), name != assignee else {
            newCoAssignee = ""
            return
        }
        coAssignees.append(name)
        newCoAssignee = ""
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

/// The shared punch list for a task: toggle (the server stamps who checked it),
/// add, delete — each hitting the API and updating in place, mirroring the web
/// detail sheet's Checklist section. Changes are local to this sheet; the
/// board's ☑ count refreshes on its next load (same model as attachments).
struct ChecklistSectionView: View {
    let taskId: String

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    @State private var items: [ChecklistItem]
    @State private var newText = ""
    @State private var busy = false
    @State private var errorMessage: String?

    init(taskId: String, items: [ChecklistItem]) {
        self.taskId = taskId
        _items = State(initialValue: items)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if items.isEmpty {
                Text("No items yet.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                HStack(spacing: 10) {
                    Button { Task { await toggle(item) } } label: {
                        Image(systemName: item.done ? "checkmark.square.fill" : "square")
                            .foregroundStyle(item.done ? Color(hex: 0x10B981) : Color.secondary)
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.text)
                            .font(.callout)
                            .strikethrough(item.done)
                            .foregroundStyle(item.done ? .secondary : .primary)
                        if item.done, let by = item.doneBy, !by.isEmpty {
                            Text("Done by \(by)").font(.caption2).foregroundStyle(.secondary)
                        }
                    }

                    Spacer(minLength: 6)

                    Button(role: .destructive) { Task { await remove(item) } } label: {
                        Image(systemName: "trash").foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack {
                TextField("Add an item", text: $newText)
                    .onSubmit { Task { await add() } }
                Button { Task { await add() } } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.plain)
                .disabled(busy || newText.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .disabled(busy)
    }

    @MainActor
    private func add() async {
        let text = newText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, let base = config.baseURL else { return }
        busy = true
        errorMessage = nil
        do {
            let item = try await APIClient(baseURL: base).addChecklistItem(taskId: taskId, text: text)
            items.append(item)
            newText = ""
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    @MainActor
    private func toggle(_ item: ChecklistItem) async {
        guard let base = config.baseURL, let idx = items.firstIndex(of: item) else { return }
        let done = !item.done
        items[idx].done = done // optimistic; reverted on failure
        do {
            try await APIClient(baseURL: base).setChecklistItem(taskId: taskId, itemId: item.id, done: done)
            items[idx].doneBy = done ? (session.displayName ?? "") : nil
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            if let i = items.firstIndex(where: { $0.id == item.id }) { items[i].done = !done }
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func remove(_ item: ChecklistItem) async {
        guard let base = config.baseURL else { return }
        errorMessage = nil
        do {
            try await APIClient(baseURL: base).deleteChecklistItem(taskId: taskId, itemId: item.id)
            items.removeAll { $0.id == item.id }
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// The attachment list for a task: download/open (QuickLook), upload (file
/// importer), and delete — each hitting the API and updating in place, mirroring
/// the web card's attachment panel. Purged email files show as a non-downloadable
/// "expired" record. Changes are local to this sheet; the board's count refreshes
/// on its next load.
struct AttachmentsView: View {
    let taskId: String

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    @State private var attachments: [Attachment]
    @State private var showImporter = false
    @State private var uploading = false
    @State private var downloadingId: String?
    @State private var previewURL: URL?
    @State private var errorMessage: String?

    init(taskId: String, attachments: [Attachment]) {
        self.taskId = taskId
        _attachments = State(initialValue: attachments)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if attachments.isEmpty {
                Text("No files yet.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(attachments) { row($0) }

            Button { showImporter = true } label: {
                Label(uploading ? "Uploading…" : "Add file", systemImage: "plus.circle")
                    .font(.callout)
            }
            .disabled(uploading)

            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fileImporter(isPresented: $showImporter,
                      allowedContentTypes: [.item],
                      allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): Task { await upload(urls) }
            case .failure(let err): errorMessage = err.localizedDescription
            }
        }
        .quickLookPreview($previewURL)
    }

    @ViewBuilder
    private func row(_ att: Attachment) -> some View {
        let purged = (att.purged == true)
        HStack(spacing: 10) {
            Button { if !purged { Task { await open(att) } } } label: {
                HStack(spacing: 8) {
                    Image(systemName: "doc").foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(att.filename).font(.callout).lineLimit(1)
                            .foregroundStyle(purged ? .secondary : .primary)
                        if purged {
                            Text("file removed after 30 days").font(.caption2).foregroundStyle(.secondary)
                        } else if !att.sizeLabel.isEmpty {
                            Text(att.sizeLabel).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(purged)

            Spacer(minLength: 6)

            if downloadingId == att.id {
                ProgressView()
            } else if purged {
                Text("expired").font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.15), in: Capsule())
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: "arrow.down.circle").foregroundStyle(.tint)
            }

            Button(role: .destructive) { Task { await delete(att) } } label: {
                Image(systemName: "trash").foregroundStyle(.red)
            }
            .buttonStyle(.plain)
        }
    }

    @MainActor
    private func upload(_ urls: [URL]) async {
        guard let base = config.baseURL else { errorMessage = "No backend URL configured."; return }
        let client = APIClient(baseURL: base)
        uploading = true
        errorMessage = nil
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            do {
                let data = try Data(contentsOf: url)
                let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                let att = try await client.uploadAttachment(taskId: taskId, filename: url.lastPathComponent,
                                                            data: data, contentType: type)
                attachments.append(att)
            } catch APIClient.APIError.notAuthenticated {
                if scoped { url.stopAccessingSecurityScopedResource() }
                session.signOut(); uploading = false; return
            } catch {
                errorMessage = error.localizedDescription
            }
            if scoped { url.stopAccessingSecurityScopedResource() }
        }
        uploading = false
    }

    @MainActor
    private func open(_ att: Attachment) async {
        guard let base = config.baseURL, att.purged != true else { return }
        downloadingId = att.id
        errorMessage = nil
        do {
            previewURL = try await APIClient(baseURL: base).downloadAttachment(id: att.id, filename: att.filename)
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
        downloadingId = nil
    }

    @MainActor
    private func delete(_ att: Attachment) async {
        guard let base = config.baseURL else { return }
        errorMessage = nil
        do {
            try await APIClient(baseURL: base).deleteAttachment(taskId: taskId, attId: att.id)
            attachments.removeAll { $0.id == att.id }
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
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
