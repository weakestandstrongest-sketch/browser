import WebKit

/// Pulls readable text out of open tabs so the assistant can "see" them.
@MainActor
enum PageExtractor {
    private static let script = """
    (() => {
      const selection = window.getSelection ? String(window.getSelection()).trim() : "";
      const root = document.querySelector('article, main, [role="main"]') || document.body;
      const text = root ? root.innerText : "";
      return JSON.stringify({ title: document.title, url: location.href, selection, text });
    })()
    """

    private struct Page: Decodable {
        var title: String
        var url: String
        var selection: String
        var text: String
    }

    /// Builds the `<page>` blocks sent to Claude. Tabs that were never loaded contribute only title and URL.
    static func context(for tabs: [BrowserTab], perTabLimit: Int) async -> String {
        var blocks: [String] = []
        for (index, tab) in tabs.enumerated() {
            var title = tab.title
            var url = tab.url?.absoluteString ?? ""
            var selection = ""
            var body = ""
            if tab.isLoaded, let page = await extract(from: tab.webView) {
                title = page.title.isEmpty ? title : page.title
                url = page.url
                selection = page.selection
                body = page.text
            }
            if url.isEmpty && body.isEmpty { continue }

            var block = "<page index=\"\(index + 1)\" title=\"\(escape(title))\" url=\"\(escape(url))\">\n"
            if !selection.isEmpty {
                block += "<user_selection>\n\(selection)\n</user_selection>\n"
            }
            if !body.isEmpty {
                block += "<content>\n\(truncate(body, limit: perTabLimit))\n</content>\n"
            } else {
                block += "<content>(本文は未読み込み)</content>\n"
            }
            block += "</page>"
            blocks.append(block)
        }
        return blocks.joined(separator: "\n\n")
    }

    private static func extract(from webView: WKWebView) async -> Page? {
        guard let json = try? await webView.evaluateJavaScript(script) as? String,
              let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Page.self, from: data)
    }

    /// Long pages are cut, and the model is told so explicitly rather than silently.
    private static func truncate(_ text: String, limit: Int) -> String {
        guard text.count > limit else { return text }
        return String(text.prefix(limit)) + "\n[…ページが長いため、全\(text.count)文字のうち先頭\(limit)文字のみ含めています]"
    }

    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "\n", with: " ")
    }
}
