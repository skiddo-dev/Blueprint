import Foundation

/// Thin wrapper over the backend's JSON API. Uses `URLSession.shared`, which
/// automatically attaches cookies from `HTTPCookieStorage.shared` — the same
/// store `WebAuthView` mirrors the Auth.js session cookie into after login.
/// Native `URLSession` is not subject to CORS, so these calls work against the
/// same origin the web app uses, with no backend changes.
struct APIClient {
    let baseURL: URL

    enum APIError: LocalizedError {
        case notAuthenticated
        case http(Int)
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .notAuthenticated: return "Your session has expired. Please sign in again."
            case .http(let code):   return "The server returned an error (HTTP \(code))."
            case .invalidResponse:  return "Unexpected response from the server."
            }
        }
    }

    /// GET /api/tasks
    func tasks() async throws -> [BoardTask] {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks"))
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode([BoardTask].self, from: data)
    }

    /// PATCH /api/tasks/{id} with body `{ field, value }` (see
    /// `src/routes/api/tasks/[id]/+server.ts`).
    func update(taskId: String, field: String, value: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)"))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["field": field, "value": value])
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// PATCH /api/tasks/{id} for array-valued fields (e.g. `co_assignees`,
    /// which the server resolves to identities alongside the names).
    func update(taskId: String, field: String, value: [String]) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)"))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["field": field, "value": value])
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    // ── Checklist (shared punch list; see /api/tasks/[id]/checklist) ─────────

    /// POST /api/tasks/{id}/checklist — add an item; the server generates the
    /// id and returns the stored item (201).
    func addChecklistItem(taskId: String, text: String) async throws -> ChecklistItem {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/checklist"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["text": text])
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        struct Created: Decodable { let item: ChecklistItem }
        return try JSONDecoder().decode(Created.self, from: data).item
    }

    /// PATCH /api/tasks/{id}/checklist/{itemId} — toggle done (the server
    /// stamps who checked it; unchecking clears the stamp).
    func setChecklistItem(taskId: String, itemId: String, done: Bool) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/checklist/\(itemId)"))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["done": done])
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// DELETE /api/tasks/{id}/checklist/{itemId}
    func deleteChecklistItem(taskId: String, itemId: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/checklist/\(itemId)"))
        req.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// POST /api/tasks — create a task. The server stamps identity/store-numbers
    /// and returns the created document (201), which we decode straight back.
    func createTask(_ body: NewTask) async throws -> BoardTask {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(BoardTask.self, from: data)
    }

    /// DELETE /api/tasks/{id} — delete a single task (owner or admin).
    func deleteTask(id: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(id)"))
        req.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// DELETE /api/tasks — admin-only "clear all". Non-admins get a 403, which
    /// surfaces as `APIError.http(403)`.
    func clearAllTasks() async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks"))
        req.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// POST /api/tasks/{id}/attachments — upload a file as multipart/form-data
    /// under the `file` field (see the endpoint). Returns the created
    /// `Attachment` metadata the server wraps in `{ ok, attachment }`.
    func uploadAttachment(taskId: String, filename: String, data: Data, contentType: String) async throws -> Attachment {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/attachments"))
        req.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body
        let (respData, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(UploadResponse.self, from: respData).attachment
    }

    /// DELETE /api/tasks/{id}/attachments/{attId} — remove a file from a card.
    func deleteAttachment(taskId: String, attId: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/attachments/\(attId)"))
        req.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// GET /api/attachments/{id} — download the bytes (cookie-authed, like every
    /// other call) and write them to a temp file so QuickLook can preview/share
    /// it. Returns the local file URL.
    func downloadAttachment(id: String, filename: String) async throws -> URL {
        let req = URLRequest(url: baseURL.appendingPathComponent("api/attachments/\(id)"))
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("attachments", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let safeName = filename.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? id
        let url = dir.appendingPathComponent(safeName.isEmpty ? id : safeName)
        try data.write(to: url, options: .atomic)
        return url
    }

    /// POST /api/tasks/{id}/comments — post a comment (or a reply when
    /// `parentId` is given). Mentions are resolved server-side; the created
    /// `TimelineEntry` is returned so the UI can append it without a reload.
    func addComment(taskId: String, text: String, parentId: String? = nil) async throws -> TimelineEntry {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/comments"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        var body: [String: Any] = ["text": text]
        if let parentId { body["parent_id"] = parentId }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(CommentResponse.self, from: data).entry
    }

    /// POST /api/tasks/{id}/comments/{commentId}/react — toggle the caller's
    /// emoji reaction. Returns the comment's new reactions map.
    func toggleReaction(taskId: String, commentId: String, emoji: String) async throws -> [String: [String]] {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/tasks/\(taskId)/comments/\(commentId)/react"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["emoji": emoji])
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(ReactResponse.self, from: data).reactions
    }

    /// GET /auth/session — Auth.js session endpoint. Returns the signed-in user
    /// (with the app's `role`/`displayName`, attached by the session callback in
    /// `auth.ts`) or nil when there's no session. This route is public, so an
    /// absent session is `{}` rather than a 401.
    func session() async throws -> SessionUser? {
        var req = URLRequest(url: baseURL.appendingPathComponent("auth/session"))
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return (try? JSONDecoder().decode(SessionResponse.self, from: data))?.user
    }

    // MARK: - Sections (admin-only on the backend)

    /// GET /api/quotes — the tracked-quote log.
    func quotes() async throws -> [Quote] {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/quotes"))
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode([Quote].self, from: data)
    }

    /// POST /api/quotes/{id}/status — set a quote's outcome (won/lost/open).
    func setQuoteStatus(id: String, status: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/quotes/\(id)/status"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["status": status])
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// GET /api/prospects — the prospect pipeline (unwraps the `{ prospects }` shape).
    func prospects() async throws -> [Prospect] {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/prospects"))
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(ProspectsResponse.self, from: data).prospects
    }

    /// PATCH /api/prospects/{id} — edit a prospect's pipeline fields. Only
    /// non-nil fields are sent (matches the endpoint's partial-patch contract).
    func patchProspect(id: String, pipelineStatus: String? = nil,
                       assignee: String? = nil, notes: String? = nil) async throws {
        var body: [String: Any] = [:]
        if let pipelineStatus { body["pipeline_status"] = pipelineStatus }
        if let assignee { body["assignee"] = assignee }
        if let notes { body["notes"] = notes }
        var req = URLRequest(url: baseURL.appendingPathComponent("api/prospects/\(id)"))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
    }

    /// GET /api/dashboard — compact KPI summary.
    func dashboard() async throws -> DashboardSummary {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/dashboard"))
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(DashboardSummary.self, from: data)
    }

    /// GET /api/search?q= — global search, role-scoped server-side.
    func search(_ query: String) async throws -> SearchResults {
        var comps = URLComponents(url: baseURL.appendingPathComponent("api/search"),
                                  resolvingAgainstBaseURL: false)
        comps?.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = comps?.url else { throw APIError.invalidResponse }
        var req = URLRequest(url: url)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(SearchResults.self, from: data)
    }

    /// POST /api/sync — trigger an email sync (admin-only). Returns the run's
    /// summary (counts + a human message).
    func syncEmail() async throws -> SyncResult {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/sync"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req, delegate: RedirectBlocker())
        try Self.check(response)
        return try JSONDecoder().decode(SyncResult.self, from: data)
    }

    private static func check(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        switch http.statusCode {
        case 200...299: return
        // The server-side guard (hooks.server.ts) 302-redirects unauthenticated
        // requests to /login, and the API routes throw 401/403. Both mean the
        // session is gone — surface it so the UI returns to the sign-in screen.
        case 300...399, 401, 403: throw APIError.notAuthenticated
        default: throw APIError.http(http.statusCode)
        }
    }
}

/// Body for `POST /api/tasks`. Matches `newTaskSchema` in
/// `src/lib/server/validation.ts` — only `title` is required; identity fields
/// are stamped server-side and must never be sent. `nil` fields are omitted by
/// `JSONEncoder` (no explicit nulls), which the schema accepts.
struct NewTask: Encodable {
    var title: String
    var description: String? = nil
    var status: String? = nil
    var assigned_to: String? = nil
    var date: String? = nil
    var notes: String? = nil
}

/// `{ ok, entry }` from `POST .../comments`.
private struct CommentResponse: Decodable { let entry: TimelineEntry }

/// `{ ok, attachment }` from `POST .../attachments`.
private struct UploadResponse: Decodable { let attachment: Attachment }

/// `{ ok, reactions }` from `POST .../react`.
private struct ReactResponse: Decodable { let reactions: [String: [String]] }

/// The signed-in user as returned by `GET /auth/session` (`session.user`).
struct SessionUser: Decodable {
    var email: String?
    var name: String?
    var displayName: String?
    var role: String?

    var isAdmin: Bool { role == "admin" }
}

private struct SessionResponse: Decodable { let user: SessionUser? }

/// Result of `POST /api/sync` — mirrors `SyncResult` in `emailSync.ts`.
struct SyncResult: Decodable {
    var count: Int          // brand-new tasks created
    var updated: Int?       // existing thread cards patched by a reply
    var message: String
    var skipped: Bool?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        count = (try? c.decode(Int.self, forKey: .count)) ?? 0
        updated = try? c.decode(Int.self, forKey: .updated)
        message = (try? c.decode(String.self, forKey: .message)) ?? "Sync complete."
        skipped = try? c.decode(Bool.self, forKey: .skipped)
    }

    enum CodingKeys: String, CodingKey { case count, updated, message, skipped }
}

/// Stops `URLSession` from auto-following the guard's 302 → /login redirect,
/// so a missing/expired session surfaces as a 3xx we can detect instead of a
/// 200 HTML login page that would fail JSON decoding.
private final class RedirectBlocker: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}
