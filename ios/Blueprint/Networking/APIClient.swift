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
