import SwiftUI

/// The tracked-quote log (`GET /api/quotes`). Tap a quote to set its outcome
/// (open / won / lost) via `POST /api/quotes/{id}/status`.
struct QuotesView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    @State private var quotes: [Quote] = []
    @State private var phase: Phase = .loading
    @State private var selected: Quote?

    private enum Phase: Equatable {
        case loading, loaded
        case failed(String)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Quotes")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }
                    }
                }
                .sheet(item: $selected) { quote in
                    QuoteDetailView(quote: quote) { updated in
                        if let i = quotes.firstIndex(where: { $0.id == updated.id }) { quotes[i] = updated }
                    }
                }
        }
        .task { if quotes.isEmpty { await load() } }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading…").frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load quotes", systemImage: "doc.text.magnifyingglass")
            } description: { Text(message) } actions: {
                Button("Try again") { Task { await load() } }.buttonStyle(.borderedProminent)
            }
        case .loaded:
            if quotes.isEmpty {
                ContentUnavailableView("No quotes", systemImage: "doc.text",
                                       description: Text("Tracked quotes will appear here."))
            } else {
                List(quotes) { quote in
                    Button { selected = quote } label: { row(quote) }
                        .buttonStyle(.plain)
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
    }

    private func row(_ quote: Quote) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(quote.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                HStack(spacing: 8) {
                    if let store = quote.storeNumber, !store.isEmpty {
                        Text("Store \(store)")
                    }
                    Text(quote.amountFormatted)
                    if let date = quote.dateSent, !date.isEmpty {
                        Text(date)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            OutcomePill(status: quote.status)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    @MainActor
    private func load() async {
        guard let base = config.baseURL else { phase = .failed("No backend URL configured."); return }
        if quotes.isEmpty { phase = .loading }
        do {
            quotes = try await APIClient(baseURL: base).quotes()
            phase = .loaded
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

/// Quote detail — read-only facts plus the outcome toggle.
struct QuoteDetailView: View {
    let quote: Quote
    let onSave: (Quote) -> Void

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var status: String
    @State private var saving = false
    @State private var errorMessage: String?

    init(quote: Quote, onSave: @escaping (Quote) -> Void) {
        self.quote = quote
        self.onSave = onSave
        _status = State(initialValue: quote.status)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Quote") {
                    Text(quote.description).font(.headline)
                    LabeledContent("Contact", value: quote.pointOfContact)
                    LabeledContent("Amount", value: quote.amountFormatted)
                    if let store = quote.storeNumber, !store.isEmpty {
                        LabeledContent("Store", value: store)
                    }
                    if let year = quote.year { LabeledContent("Year", value: String(year)) }
                    if let date = quote.dateSent, !date.isEmpty { LabeledContent("Sent", value: date) }
                    if let po = quote.po, !po.isEmpty { LabeledContent("PO", value: po) }
                }

                Section("Outcome") {
                    Picker("Outcome", selection: $status) {
                        ForEach(QuoteOutcome.order, id: \.self) { s in
                            Text(QuoteOutcome.label(s)).tag(s)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                if let notes = quote.notes, !notes.isEmpty {
                    Section("Notes") { Text(notes).font(.callout) }
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.callout).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Quote")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(saving || status == quote.status)
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
        do {
            try await APIClient(baseURL: base).setQuoteStatus(id: quote.id, status: status)
            var updated = quote
            updated.status = status
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
#Preview("Quote detail") {
    QuoteDetailView(quote: Quote.samples[0]) { _ in }
        .environment(AppConfig())
        .environment(SessionStore())
}
#endif
