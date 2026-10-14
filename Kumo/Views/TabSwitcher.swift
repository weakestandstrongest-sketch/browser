import SwiftUI

/// Tab overview with Arc-style spaces at the top and pinned tabs separated from today's tabs.
struct TabSwitcher: View {
    @EnvironmentObject private var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    var onNewTab: () -> Void

    @State private var showNewSpace = false
    @State private var showArchive = false
    @State private var spaceToDelete: Space?

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        let tabs = store.tabsInCurrentSpace
        let pinned = tabs.filter(\.isPinned)
        let others = tabs.filter { !$0.isPinned }

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    spaceStrip
                    if !pinned.isEmpty { section("ピン留め", tabs: pinned) }
                    if !others.isEmpty {
                        section("今日", tabs: others)
                    } else if pinned.isEmpty {
                        ContentUnavailableView("タブがありません", systemImage: "square.on.square",
                                               description: Text("下の ＋ から新しいタブを開きましょう"))
                            .padding(.top, 40)
                    }
                }
                .padding(.bottom, 24)
            }
            .background(store.currentSpace.theme.gradient.opacity(0.18).ignoresSafeArea())
            .simultaneousGesture(spaceSwipe)
            .navigationTitle("\(store.currentSpace.emoji) \(store.currentSpace.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showArchive = true } label: { Image(systemName: "archivebox") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完了") { dismiss() }.bold()
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Menu {
                        Button(role: .destructive) { store.closeAllUnpinned() } label: {
                            Label("ピン留め以外をすべて閉じる", systemImage: "xmark.square")
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                    Spacer()
                    Button(action: onNewTab) {
                        Label("新しいタブ", systemImage: "plus")
                            .labelStyle(.titleAndIcon)
                            .bold()
                    }
                    Spacer()
                    Text("\(tabs.count)個のタブ").font(.caption).foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showNewSpace) { NewSpaceView().environmentObject(store) }
            .sheet(isPresented: $showArchive) { ArchiveView().environmentObject(store) }
            .confirmationDialog("スペースを削除しますか？", isPresented: Binding(
                get: { spaceToDelete != nil }, set: { if !$0 { spaceToDelete = nil } }
            ), presenting: spaceToDelete) { space in
                Button("「\(space.name)」を削除（タブはアーカイブへ）", role: .destructive) { store.deleteSpace(space) }
            }
        }
        .tint(store.currentSpace.theme.accent)
    }

    private var spaceStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.spaces) { space in
                    let isCurrent = space.id == store.currentSpaceID
                    Button { withAnimation { store.switchTo(space) } } label: {
                        HStack(spacing: 6) {
                            Text(space.emoji)
                            Text(space.name).font(.subheadline.weight(.semibold))
                        }
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .foregroundStyle(isCurrent ? Color.white : Color.primary)
                        .background {
                            if isCurrent {
                                Capsule().fill(space.theme.gradient)
                            } else {
                                Capsule().fill(Color(.secondarySystemBackground))
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        if store.spaces.count > 1 {
                            Button(role: .destructive) { spaceToDelete = space } label: {
                                Label("スペースを削除", systemImage: "trash")
                            }
                        }
                    }
                }
                Button { showNewSpace = true } label: {
                    Image(systemName: "plus")
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color(.secondarySystemBackground)))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private func section(_ title: String, tabs: [BrowserTab]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 20)
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(tabs) { tab in
                    TabCard(tab: tab, isSelected: tab.id == store.selectedTab?.id) {
                        withAnimation { store.close(tab) }
                    }
                    .onTapGesture {
                        store.select(tab)
                        dismiss()
                    }
                    .contextMenu { contextMenu(for: tab) }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    @ViewBuilder
    private func contextMenu(for tab: BrowserTab) -> some View {
        Button { store.togglePin(tab) } label: {
            Label(tab.isPinned ? "ピン留めを外す" : "ピン留め", systemImage: tab.isPinned ? "pin.slash" : "pin")
        }
        if store.spaces.count > 1 {
            Menu {
                ForEach(store.spaces.filter { $0.id != tab.spaceID }) { space in
                    Button("\(space.emoji) \(space.name)") { store.move(tab, to: space) }
                }
            } label: {
                Label("スペースへ移動", systemImage: "arrow.right.square")
            }
        }
        Button(role: .destructive) { store.close(tab) } label: {
            Label("閉じる", systemImage: "xmark")
        }
    }

    /// Swipe left/right anywhere to move between spaces, like Arc.
    private var spaceSwipe: some Gesture {
        DragGesture(minimumDistance: 40).onEnded { value in
            guard abs(value.translation.width) > abs(value.translation.height) * 2,
                  let index = store.spaces.firstIndex(where: { $0.id == store.currentSpaceID }) else { return }
            let next = index + (value.translation.width < 0 ? 1 : -1)
            if store.spaces.indices.contains(next) {
                withAnimation { store.switchTo(store.spaces[next]) }
            }
        }
    }
}

private struct TabCard: View {
    @ObservedObject var tab: BrowserTab
    let isSelected: Bool
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                FaviconView(url: tab.url, size: 16)
                Text(tab.title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
                if tab.isPinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.tint)
                }
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 22, height: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 10)
            .padding(.trailing, 4)
            .padding(.vertical, 6)

            ZStack {
                Color(.secondarySystemBackground)
                if let snapshot = tab.snapshot {
                    Image(uiImage: snapshot)
                        .resizable()
                        .scaledToFill()
                } else {
                    FaviconView(url: tab.url, size: 36)
                }
            }
            .frame(height: 180, alignment: .top)
            .clipped()
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(isSelected ? AnyShapeStyle(.tint) : AnyShapeStyle(Color.primary.opacity(0.08)), lineWidth: isSelected ? 3 : 1)
        }
        .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct NewSpaceView: View {
    @EnvironmentObject private var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var emoji = "✨"
    @State private var theme: SpaceTheme = .grape

    private let emojiChoices = ["✨", "💼", "📚", "🎮", "🛒", "✈️", "🎨", "🍳", "💻", "🎵"]

    var body: some View {
        NavigationStack {
            Form {
                Section("名前") {
                    TextField("例: 仕事、趣味、勉強", text: $name)
                }
                Section("アイコン") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(emojiChoices, id: \.self) { choice in
                                Text(choice)
                                    .font(.title2)
                                    .frame(width: 44, height: 44)
                                    .background(Circle().fill(choice == emoji ? Color.accentColor.opacity(0.2) : .clear))
                                    .onTapGesture { emoji = choice }
                            }
                        }
                    }
                }
                Section("カラー") {
                    HStack(spacing: 12) {
                        ForEach(SpaceTheme.allCases) { option in
                            Circle()
                                .fill(option.gradient)
                                .frame(width: 36, height: 36)
                                .overlay(Circle().strokeBorder(.primary, lineWidth: option == theme ? 3 : 0))
                                .onTapGesture { theme = option }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("新しいスペース")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("作成") {
                        let trimmed = name.trimmingCharacters(in: .whitespaces)
                        store.addSpace(name: trimmed.isEmpty ? "新しいスペース" : trimmed, emoji: emoji, theme: theme)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

struct ArchiveView: View {
    @EnvironmentObject private var store: BrowserStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if store.archived.isEmpty {
                    ContentUnavailableView("アーカイブは空です", systemImage: "archivebox",
                                           description: Text("閉じたタブや、しばらく使わなかったタブがここに入ります"))
                }
                ForEach(store.archived) { item in
                    Button {
                        store.restore(item)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            FaviconView(url: item.url, size: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title).lineLimit(1)
                                Text("\(item.url.host() ?? "") · \(item.archivedAt.formatted(.relative(presentation: .named)))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }
            .navigationTitle("アーカイブ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } }
                ToolbarItem(placement: .destructiveAction) {
                    Button("すべて削除", role: .destructive) { store.clearArchive() }
                        .disabled(store.archived.isEmpty)
                }
            }
        }
    }
}
