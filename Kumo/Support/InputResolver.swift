import Foundation

/// Decides whether text typed into the command bar is a URL, a search, or a question for the AI.
enum InputResolver {
    static func url(from raw: String) -> URL? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !text.contains(" ") else { return nil }

        if let url = URL(string: text), let scheme = url.scheme?.lowercased() {
            if ["http", "https"].contains(scheme), url.host() != nil { return url }
            if scheme == "about" { return url }
        }

        // Bare domains such as "example.com", "news.ycombinator.com/item?id=1" or "localhost:3000".
        guard let url = URL(string: "https://" + text), let host = url.host() else { return nil }
        if host == "localhost" { return url }
        let labels = host.split(separator: ".")
        guard labels.count >= 2, let tld = labels.last else { return nil }
        let isIPv4 = labels.count == 4 && labels.allSatisfy { $0.allSatisfy(\.isNumber) }
        let isDomain = tld.count >= 2 && tld.allSatisfy(\.isLetter)
        return isIPv4 || isDomain ? url : nil
    }

    /// Heuristic used to rank "Ask Kumo" above "Search" in the command bar, like Dia's smart address bar.
    static func looksLikeQuestion(_ raw: String) -> Bool {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.hasSuffix("?") || text.hasSuffix("？") { return true }
        let starters = [
            "なぜ", "どう", "何", "なに", "教えて", "要約", "説明", "まとめ", "比較", "翻訳", "このページ",
            "what ", "why ", "how ", "who ", "explain", "summarize", "compare", "translate",
        ]
        if starters.contains(where: { text.hasPrefix($0) }) { return true }
        return text.count > 40
    }
}
