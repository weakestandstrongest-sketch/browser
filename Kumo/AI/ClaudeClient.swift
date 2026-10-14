import Foundation

/// Streams replies from the Claude Messages API over Server-Sent Events.
/// Swift has no official Anthropic SDK, so this calls the REST API directly.
struct ClaudeClient {
    struct Turn {
        var role: String  // "user" or "assistant"
        var content: String
    }

    enum ClientError: LocalizedError {
        case http(Int, String)
        case refused
        case stream(String)

        var errorDescription: String? {
            switch self {
            case let .http(status, message):
                status == 401 ? "APIキーが無効です。設定を確認してください。" : "APIエラー (\(status)): \(message)"
            case .refused:
                "このリクエストには回答できませんでした。"
            case let .stream(message):
                "ストリーミング中にエラーが発生しました: \(message)"
            }
        }
    }

    var apiKey: String
    var model: ClaudeModel
    var effort: AIEffort

    private static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!

    func stream(system: String, turns: [Turn]) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let request = try makeRequest(system: system, turns: turns)
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard status == 200 else {
                        var body = ""
                        for try await line in bytes.lines { body += line }
                        throw ClientError.http(status, Self.errorMessage(from: body))
                    }
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue }
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        guard let data = payload.data(using: .utf8),
                              let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let type = event["type"] as? String else { continue }
                        switch type {
                        case "content_block_delta":
                            // Only visible text is shown; thinking deltas are ignored.
                            if let delta = event["delta"] as? [String: Any],
                               delta["type"] as? String == "text_delta",
                               let text = delta["text"] as? String {
                                continuation.yield(text)
                            }
                        case "message_delta":
                            if let delta = event["delta"] as? [String: Any],
                               delta["stop_reason"] as? String == "refusal" {
                                throw ClientError.refused
                            }
                        case "error":
                            let message = (event["error"] as? [String: Any])?["message"] as? String ?? "unknown"
                            throw ClientError.stream(message)
                        default:
                            break
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func makeRequest(system: String, turns: [Turn]) throws -> URLRequest {
        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 600
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        var body: [String: Any] = [
            "model": model.rawValue,
            "max_tokens": 64000,
            "stream": true,
            "system": system,
            "output_config": ["effort": effort.rawValue],
            "messages": turns.map { ["role": $0.role, "content": $0.content] },
        ]
        if model.supportsServerFallback {
            // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
            request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
            body["fallbacks"] = "default"
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    private static func errorMessage(from body: String) -> String {
        guard let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = json["error"] as? [String: Any],
              let message = error["message"] as? String else { return body }
        return message
    }
}
