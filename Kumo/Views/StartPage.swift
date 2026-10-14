import SwiftUI

/// Shown when no tab is selected in the current space.
struct StartPage: View {
    @EnvironmentObject private var store: BrowserStore
    var onSearch: () -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)

    var body: some View {
        let space = store.currentSpace
        let tabs = store.tabsInCurrentSpace
        let pinned = tabs.filter(\.isPinned)
        let others = tabs.filter { !$0.isPinned }

        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 6) {
                    Text(space.emoji).font(.system(size: 56))
                    Text(space.name).font(.title.bold())
                    Text(greeting).font(.subheadline).opacity(0.85)
                }
                .foregroundStyle(.white)
                .padding(.top, 56)

                Button(action: onSearch) {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkle.magnifyingglass")
                        Text("検索、URL、またはAIに質問")
                        Spacer()
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 18)
                    .frame(height: 52)
                    .glassBackground(in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)

                if !pinned.isEmpty {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(pinned) { tab in
                            Button { store.select(tab) } label: {
                                VStack(spacing: 6) {
                                    FaviconView(url: tab.url, size: 28)
                                        .frame(width: 58, height: 58)
                                        .glassBackground(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    Text(tab.title)
                                        .font(.caption2)
                                        .foregroundStyle(.white)
                                        .lineLimit(1)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                }

                if !others.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("開いているタブ")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.85))
                            .padding(.leading, 4)
                        VStack(spacing: 0) {
                            ForEach(others.prefix(8)) { tab in
                                Button { store.select(tab) } label: {
                                    HStack(spacing: 10) {
                                        FaviconView(url: tab.url, size: 18)
                                        Text(tab.title).lineLimit(1)
                                        Spacer()
                                    }
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 12)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if tab.id != others.prefix(8).last?.id { Divider().padding(.leading, 42) }
                            }
                        }
                        .glassBackground(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .padding(.horizontal, 20)
                }

                Text("ヒント: 下のバーを左右にスワイプでタブ切替、上にスワイプでタブ一覧")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 24)
            }
        }
    }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<11: "おはようございます"
        case 11..<18: "こんにちは"
        default: "こんばんは"
        }
    }
}
