import SwiftUI

/// The comment thread for a task: top-level comments with one level of nested
/// replies, emoji reactions, and a composer. Backed by the task's `timeline`
/// (`kind == .comment`). Posting / reacting hit the API and update in place, so
/// the thread reflects changes without a full board reload.
struct CommentsView: View {
    let taskId: String

    @Environment(AppConfig.self) private var config
    @Environment(SessionStore.self) private var session

    /// Authoritative local copy of the thread (seeded from the task, then kept
    /// current as we post / react). Oldest-first.
    @State private var comments: [TimelineEntry]
    @State private var draft = ""
    @State private var replyingTo: TimelineEntry?
    @State private var sending = false
    @State private var errorMessage: String?
    @FocusState private var composerFocused: Bool

    /// The fixed reaction set — mirrors `REACTION_EMOJIS` in `src/lib/reactions.ts`.
    private static let reactionEmojis = ["👍", "❤️", "✅", "👀", "🎉"]

    init(taskId: String, comments: [TimelineEntry]) {
        self.taskId = taskId
        _comments = State(initialValue: comments)
    }

    private var topLevel: [TimelineEntry] { comments.filter { !$0.isReply } }
    private func replies(to parentId: String) -> [TimelineEntry] {
        comments.filter { $0.parentId == parentId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if topLevel.isEmpty {
                Text("No comments yet. Start the conversation.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(topLevel) { comment in
                    bubble(comment, isReply: false)
                    ForEach(replies(to: comment.id)) { reply in
                        bubble(reply, isReply: true)
                            .padding(.leading, 24)
                    }
                }
            }

            composer
        }
    }

    // MARK: - One comment

    @ViewBuilder
    private func bubble(_ comment: TimelineEntry, isReply: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(comment.author ?? "Someone").font(.subheadline.weight(.semibold))
                Text(Self.relative(comment.at)).font(.caption).foregroundStyle(.secondary)
                if comment.editedAt != nil {
                    Text("· edited").font(.caption2).foregroundStyle(.tertiary)
                }
            }

            Text(mentionAttributed(comment.text))
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)

            reactionRow(comment)

            if !isReply {
                Button {
                    replyingTo = comment
                    composerFocused = true
                } label: {
                    Label("Reply", systemImage: "arrowshape.turn.up.left")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Reactions

    @ViewBuilder
    private func reactionRow(_ comment: TimelineEntry) -> some View {
        let me = session.displayName ?? ""
        HStack(spacing: 6) {
            ForEach(comment.reactions.sorted(by: { $0.key < $1.key }), id: \.key) { emoji, names in
                let mine = names.contains(me)
                Button { Task { await react(comment, emoji) } } label: {
                    HStack(spacing: 3) {
                        Text(emoji)
                        Text("\(names.count)").font(.caption2.weight(.medium))
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(mine ? Color.accentColor.opacity(0.18) : Color(.tertiarySystemBackground),
                                in: Capsule())
                    .overlay(Capsule().strokeBorder(mine ? Color.accentColor : .clear))
                }
                .buttonStyle(.plain)
            }

            Menu {
                ForEach(Self.reactionEmojis, id: \.self) { emoji in
                    Button(emoji) { Task { await react(comment, emoji) } }
                }
            } label: {
                Image(systemName: "face.smiling")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color(.tertiarySystemBackground), in: Capsule())
            }
        }
    }

    // MARK: - Composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let replyingTo {
                HStack(spacing: 6) {
                    Image(systemName: "arrowshape.turn.up.left").font(.caption2)
                    Text("Replying to \(replyingTo.author ?? "comment")").font(.caption)
                    Spacer()
                    Button { self.replyingTo = nil } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
                .foregroundStyle(.secondary)
            }

            HStack(alignment: .bottom, spacing: 8) {
                TextField("Add a comment… use @ to mention", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .focused($composerFocused)
                    .disabled(sending)

                Button { Task { await send() } } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
        }
    }

    // MARK: - Actions

    @MainActor
    private func send() async {
        guard let base = config.baseURL else { errorMessage = "No backend URL configured."; return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        errorMessage = nil
        do {
            let entry = try await APIClient(baseURL: base)
                .addComment(taskId: taskId, text: text, parentId: replyingTo?.id)
            comments.append(entry)
            draft = ""
            replyingTo = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        sending = false
    }

    @MainActor
    private func react(_ comment: TimelineEntry, _ emoji: String) async {
        guard let base = config.baseURL else { return }
        do {
            let reactions = try await APIClient(baseURL: base)
                .toggleReaction(taskId: taskId, commentId: comment.id, emoji: emoji)
            if let i = comments.firstIndex(where: { $0.id == comment.id }) {
                comments[i].reactions = reactions
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    /// Bold + tint `@mention` tokens so they read like the web's highlight.
    /// Token-based (split on spaces) to stay clear of regex-literal language-mode
    /// concerns; comment text is short so collapsing runs of spaces is harmless.
    private func mentionAttributed(_ text: String) -> AttributedString {
        var result = AttributedString("")
        let words = text.split(separator: " ", omittingEmptySubsequences: false)
        for (idx, word) in words.enumerated() {
            var piece = AttributedString(String(word))
            if word.hasPrefix("@") && word.count > 1 {
                piece.font = .callout.weight(.semibold)
                piece.foregroundColor = .accentColor
            }
            result += piece
            if idx < words.count - 1 { result += AttributedString(" ") }
        }
        return result
    }

    private static let iso = ISO8601DateFormatter()
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let relFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()

    static func relative(_ isoString: String) -> String {
        guard let date = isoFrac.date(from: isoString) ?? iso.date(from: isoString) else { return "" }
        return relFormatter.localizedString(for: date, relativeTo: Date())
    }
}

#if DEBUG
#Preview("Comments") {
    ScrollView {
        CommentsView(taskId: "3", comments: BoardTask.samples[2].comments)
            .padding()
    }
    .environment(AppConfig())
    .environment(SessionStore())
}
#endif
