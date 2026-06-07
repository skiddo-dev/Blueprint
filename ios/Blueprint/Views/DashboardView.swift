import SwiftUI

/// Mobile dashboard: task counts by status and quote counts/value by outcome,
/// from `GET /api/dashboard`. Read-only KPIs — the win/loss toggle lives on the
/// Quotes tab.
struct DashboardView: View {
    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    @State private var summary: DashboardSummary?
    @State private var phase: Phase = .loading

    private enum Phase: Equatable {
        case loading, loaded
        case failed(String)
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Dashboard")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }
                    }
                }
        }
        .task { if summary == nil { await load() } }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            ProgressView("Loading…").frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load the dashboard", systemImage: "chart.bar.xaxis")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await load() } }.buttonStyle(.borderedProminent)
            }
        case .loaded:
            if let summary { dashboard(summary) }
        }
    }

    private func dashboard(_ s: DashboardSummary) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                sectionHeader("Tasks")
                LazyVGrid(columns: columns, spacing: 12) {
                    KPICard(title: "Total tasks", value: "\(s.totalTasks)", tint: Color(hex: 0x6366F1))
                    KPICard(title: "Open quotes", value: "\(s.quotesByStatus.open)", tint: QuoteOutcome.color("open"))
                }
                statusBreakdown(s)

                sectionHeader("Quotes")
                LazyVGrid(columns: columns, spacing: 12) {
                    KPICard(title: "Total value", value: money(s.quoteValue.total), tint: Color(hex: 0x6366F1))
                    KPICard(title: "Quotes", value: "\(s.totalQuotes)", tint: Color(hex: 0x64748B))
                    KPICard(title: "Won", value: money(s.quoteValue.won), subtitle: "\(s.quotesByStatus.won)", tint: QuoteOutcome.color("won"))
                    KPICard(title: "Lost", value: money(s.quoteValue.lost), subtitle: "\(s.quotesByStatus.lost)", tint: QuoteOutcome.color("lost"))
                }
            }
            .padding(16)
        }
        .refreshable { await load() }
    }

    private func statusBreakdown(_ s: DashboardSummary) -> some View {
        VStack(spacing: 0) {
            ForEach(TaskStatus.allCases) { status in
                HStack {
                    Text(status.icon).foregroundStyle(status.accent)
                    Text(status.rawValue).font(.subheadline)
                    Spacer()
                    Text("\(s.tasksByStatus[status.rawValue] ?? 0)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                }
                .padding(.vertical, 9)
                if status != TaskStatus.allCases.last {
                    Divider()
                }
            }
        }
        .padding(.horizontal, 14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title).font(.title3.bold())
    }

    private func money(_ n: Double) -> String {
        Quote.currency.string(from: n as NSNumber) ?? "$0"
    }

    @MainActor
    private func load() async {
        guard let base = config.baseURL else { phase = .failed("No backend URL configured."); return }
        if summary == nil { phase = .loading }
        do {
            summary = try await APIClient(baseURL: base).dashboard()
            phase = .loaded
        } catch APIClient.APIError.notAuthenticated {
            session.signOut()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

private struct KPICard: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let subtitle {
                Text("\(subtitle) quotes").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .overlay(alignment: .topTrailing) {
            Circle().fill(tint).frame(width: 8, height: 8).padding(12)
        }
    }
}

#if DEBUG
#Preview("Dashboard") {
    DashboardView()
        .environment(AppConfig())
        .environment(SessionStore())
}
#endif
