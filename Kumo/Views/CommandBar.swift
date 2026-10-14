import SwiftUI

/// Full-screen smart address bar: one field for URLs, searches and questions to the AI (Dia style).
struct CommandBar: View {
    enum Action {
        case open(URL)
        case search(String)
        case ask(String)
        case switchTo(BrowserTab)
    }

    private struct Suggestion: Identifiable {
        let id: String
        let action: Action
        let icon: String
        let title: String
        let subtitle: String
        var url: URL?
    }

    let request: CommandBarRequest
    let tabs: [BrowserTab]
    let onAction: (Action) -> Void

    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppSettings.searchEngineKey) private var engine: SearchEngine = .google
    @State private var text: String
    @FocusState private var isFocused: Bool

    init(request: CommandBarRequest, tabs: [BrowserTab], onAction: @escaping (Action) -> Void) {
        self.request = request
        self.tabs = tabs
        self.onAction = onAction
        _text = State(initialValue: request.initialText)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkle.magnifyingglass").foregroundStyle(.secondary)
                    TextField("検索、URL、またはAIに質問", text: $text)
                        .focused($isFocused)
                        .keyboardType(.webSearch)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .onSubmit { if let first = suggestions.first { perform(first.action) } }
                    if !text.isEmpty {
                        Button { text = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(Color(.secondarySystemBackground), in: Capsule())

                Button("キャンセル") { dismiss() }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            List {
                if text.trimmingCharacters(in: .whitespaces).isEmpty {
                    if !tabs.isEmpty {
                        Section("このスペースのタブ") {
                            ForEach(tabs.prefix(8)) { tab in
                                row(Suggestion(id: tab.id.uuidString, action: .switchTo(tab), icon: "", title: tab.title,
                                               subtitle: tab.displayHost ?? "", url: tab.url))
                            }
                        }
                    }
                    Section {
                        Label("「?」で終わる文章はAIへの質問として扱われます", systemImage: "sparkles")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    ForEach(suggestions) { row($0) }
                }
            }
            .listStyle(.insetGrouped)
            .scrollDismissesKeyboard(.immediately)
        }
        .onAppear { isFocused = true }
    }

    private var suggestions: [Suggestion] {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }

        var items: [Suggestion] = []
        if let url = InputResolver.url(from: query) {
            items.append(Suggestion(id: "open", action: .open(url), icon: "globe", title: url.absoluteString, subtitle: "サイトを開く"))
        }
        let search = Suggestion(id: "search", action: .search(query), icon: "magnifyingglass", title: query, subtitle: "\(engine.name)で検索")
        let ask = Suggestion(id: "ask", action: .ask(query), icon: "sparkles", title: query, subtitle: "Kumo AIに聞く（表示中のページについて）")
        items += InputResolver.looksLikeQuestion(query) ? [ask, search] : [search, ask]

        let lowered = query.lowercased()
        let matches = tabs.filter {
            $0.title.lowercased().contains(lowered) || ($0.url?.absoluteString.lowercased().contains(lowered) ?? false)
        }
        for tab in matches.prefix(5) {
            items.append(Suggestion(id: tab.id.uuidString, action: .switchTo(tab), icon: "", title: tab.title,
                                    subtitle: "タブに切り替え · \(tab.displayHost ?? "")", url: tab.url))
        }
        return items
    }

    private func row(_ suggestion: Suggestion) -> some View {
        Button { perform(suggestion.action) } label: {
            HStack(spacing: 12) {
                Group {
                    if suggestion.icon.isEmpty {
                        FaviconView(url: suggestion.url, size: 20)
                    } else {
                        Image(systemName: suggestion.icon)
                            .foregroundStyle(suggestion.id == "ask" ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                    }
                }
                .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(suggestion.title).lineLimit(1)
                    Text(suggestion.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
        .foregroundStyle(.primary)
    }

    private func perform(_ action: Action) {
        onAction(action)
        dismiss()
    }
}
