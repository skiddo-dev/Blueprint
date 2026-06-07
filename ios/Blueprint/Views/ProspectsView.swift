import SwiftUI

/// The prospect pipeline (`GET /api/prospects`). Tap a prospect to edit its
/// pipeline fields (status / assignee / notes) via `PATCH /api/prospects/{id}`.
/// Property facts come from ATTOM (or mock) and are read-only.
struct ProspectsView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    @State private var prospects: [Prospect] = []
    @State private var phase: Phase = .loading
    @State private var selected: Prospect?

    private enum Phase: Equatable {
        case loading, loaded
        case failed(String)
    }

    /// Nearest first — the field rep works outward from the search center.
    private var sorted: [Prospect] {
        prospects.sorted { ($0.distanceMiles ?? .greatestFiniteMagnitude) < ($1.distanceMiles ?? .greatestFiniteMagnitude) }
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Prospects")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }
                    }
                }
                .sheet(item: $selected) { prospect in
                    ProspectDetailView(prospect: prospect) { updated in
                        if let i = prospects.firstIndex(where: { $0.id == updated.id }) { prospects[i] = updated }
                    }
                }
        }
        .task { if prospects.isEmpty { await load() } }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading…").frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load prospects", systemImage: "building.2")
            } description: { Text(message) } actions: {
                Button("Try again") { Task { await load() } }.buttonStyle(.borderedProminent)
            }
        case .loaded:
            if prospects.isEmpty {
                ContentUnavailableView("No prospects", systemImage: "building.2",
                                       description: Text("Pulled warehouse leads will appear here."))
            } else {
                List(sorted) { prospect in
                    Button { selected = prospect } label: { row(prospect) }
                        .buttonStyle(.plain)
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
    }

    private func row(_ p: Prospect) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(p.address).font(.subheadline.weight(.semibold)).lineLimit(2)
                HStack(spacing: 8) {
                    if let owner = p.owner, !owner.isEmpty { Text(owner).lineLimit(1) }
                    if let sqft = p.sqftFormatted { Text(sqft) }
                    if let dist = p.distanceFormatted { Text(dist) }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            PipelinePill(status: p.pipelineStatus)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    @MainActor
    private func load() async {
        guard let base = config.baseURL else { phase = .failed("No backend URL configured."); return }
        if prospects.isEmpty { phase = .loading }
        do {
            prospects = try await APIClient(baseURL: base).prospects()
            phase = .loaded
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

/// Prospect detail — read-only property facts plus editable pipeline fields.
struct ProspectDetailView: View {
    let prospect: Prospect
    let onSave: (Prospect) -> Void

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var pipelineStatus: String
    @State private var assignee: String
    @State private var notes: String
    @State private var saving = false
    @State private var errorMessage: String?

    init(prospect: Prospect, onSave: @escaping (Prospect) -> Void) {
        self.prospect = prospect
        self.onSave = onSave
        _pipelineStatus = State(initialValue: prospect.pipelineStatus)
        _assignee = State(initialValue: prospect.assignee ?? "")
        _notes = State(initialValue: prospect.notes ?? "")
    }

    private var dirty: Bool {
        pipelineStatus != prospect.pipelineStatus ||
        assignee != (prospect.assignee ?? "") ||
        notes != (prospect.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Property") {
                    Text(prospect.address).font(.headline)
                    if let owner = prospect.owner, !owner.isEmpty { LabeledContent("Owner", value: owner) }
                    if let sqft = prospect.sqftFormatted { LabeledContent("Size", value: sqft) }
                    if let year = prospect.yearBuilt { LabeledContent("Built", value: String(year)) }
                    if let dist = prospect.distanceFormatted { LabeledContent("Distance", value: dist) }
                    if let mv = prospect.marketValue {
                        LabeledContent("Market value", value: Quote.currency.string(from: mv as NSNumber) ?? "—")
                    }
                }

                Section("Pipeline") {
                    Picker("Status", selection: $pipelineStatus) {
                        ForEach(PipelineStatus.order, id: \.self) { s in
                            Text(PipelineStatus.meta(s).label).tag(s)
                        }
                    }
                    .pickerStyle(.menu)
                    TextField("Assignee", text: $assignee).textInputAutocapitalization(.words)
                }

                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 100)
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.callout).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Prospect")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(saving || !dirty)
                }
            }
            .disabled(saving)
            .overlay { if saving { ProgressView().controlSize(.large) } }
        }
    }

    @MainActor
    private func save() async {
        guard let base = config.baseURL else { errorMessage = "No backend URL configured."; return }
        saving = true
        errorMessage = nil
        let client = APIClient(baseURL: base)
        do {
            try await client.patchProspect(
                id: prospect.id,
                pipelineStatus: pipelineStatus != prospect.pipelineStatus ? pipelineStatus : nil,
                assignee: assignee != (prospect.assignee ?? "") ? assignee : nil,
                notes: notes != (prospect.notes ?? "") ? notes : nil
            )
            var updated = prospect
            updated.pipelineStatus = pipelineStatus
            updated.assignee = assignee.isEmpty ? nil : assignee
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

#if DEBUG
#Preview("Prospect detail") {
    ProspectDetailView(prospect: Prospect.samples[0]) { _ in }
        .environment(AppConfig())
        .environment(SessionStore())
}
#endif
