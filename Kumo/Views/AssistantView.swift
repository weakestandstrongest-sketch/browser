import SwiftUI

/// Chat panel for asking about the current page or every tab in the space.
struct AssistantView: View {
    @EnvironmentObject private var store: BrowserStore
    @ObservedObject var model: AssistantModel
    @State private var input = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("対象", selection: $model.scope) {
                    ForEach(AssistantModel.Scope.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if model.messages.isEmpty { emptyState }
                            ForEach(model.messages) { message in
                                MessageBubble(message: message).id(message.id)
                            }
                            if model.isStreaming, model.messages.last?.text.isEmpty ?? true {
                                ProgressView().padding(.leading, 4)
                            }
                        }
                        .padding(16)
                    }
                    .onChange(of: model.messages.last?.text) { _, _ in
                        if let last = model.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }

                skillChips
                inputBar
            }
            .navigationTitle("Kumo AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { model.reset() } label: { Image(systemName: "square.and.pencil") }
                        .disabled(model.messages.isEmpty)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(contextDescription, systemImage: "doc.text.magnifyingglass")
                .font(.subheadline.weight(.semibold))
            Text("ページを要約したり、質問したり、複数のタブを比較できます。ページ上でテキストを選択してから聞くと、その部分について答えます。")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if Keychain.apiKey == nil {
                Text("⚠️ 先に設定画面で Anthropic の APIキー を登録してください。")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private var contextDescription: String {
        switch model.scope {
        case .page: store.selectedTab.map { "表示中: \($0.title)" } ?? "表示中のページはありません"
        case .space: "\(store.currentSpace.emoji) \(store.currentSpace.name) の \(store.tabsInCurrentSpace.count) 個のタブ"
        }
    }

    private var skillChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(AssistantModel.skills) { skill in
                    Button {
                        if skill.label == "比較" { model.scope = .space }
                        model.send(skill.prompt, store: store)
                    } label: {
                        Label(skill.label, systemImage: skill.icon)
                            .font(.footnote.weight(.medium))
                            .padding(.horizontal, 12)
                            .frame(height: 32)
                            .background(Capsule().fill(Color(.secondarySystemBackground)))
                    }
                    .buttonStyle(.plain)
                    .disabled(model.isStreaming)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("質問を入力…", text: $input, axis: .vertical)
                .lineLimit(1...5)
                .focused($isInputFocused)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20))
            if model.isStreaming {
                Button { model.stop() } label: {
                    Image(systemName: "stop.circle.fill").font(.system(size: 32))
                }
            } else {
                Button {
                    model.send(input, store: store)
                    input = ""
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 32))
                }
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 10)
    }
}

private struct MessageBubble: View {
    let message: AssistantModel.Message

    var body: some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 40)
                Text(message.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .foregroundStyle(.white)
                    .background(RoundedRectangle(cornerRadius: 18).fill(.tint))
            }
        case .assistant:
            if !message.text.isEmpty {
                Text(Self.markdown(message.text))
                    .foregroundStyle(message.isError ? AnyShapeStyle(.red) : AnyShapeStyle(.primary))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// Inline Markdown (bold, links, code) while keeping line breaks.
    private static func markdown(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}
