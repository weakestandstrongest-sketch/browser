import SwiftUI

struct CommandBarRequest: Identifiable {
    let id = UUID()
    var newTab: Bool
    var initialText: String
}

/// Root screen: the current tab framed by the space's gradient (Arc style) with a bottom bar.
struct BrowserView: View {
    @EnvironmentObject private var store: BrowserStore
    @StateObject private var assistant = AssistantModel()

    @State private var commandBar: CommandBarRequest?
    @State private var pendingAsk: String?
    @State private var pendingNewTab = false
    @State private var showTabs = false
    @State private var showAssistant = false
    @State private var showSettings = false

    private var theme: SpaceTheme { store.currentSpace.theme }

    var body: some View {
        VStack(spacing: 0) {
            if let tab = store.selectedTab {
                WebViewContainer(tab: tab)
                    .id(tab.id)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
                    .padding(.horizontal, 6)
                    .transition(.opacity)
            } else {
                StartPage(onSearch: { openCommandBar(newTab: true) })
            }

            BottomBar(
                tab: store.selectedTab,
                tabCount: store.tabsInCurrentSpace.count,
                actions: BottomBarActions(
                    openAddress: { openCommandBar(newTab: store.selectedTab == nil) },
                    newTab: { openCommandBar(newTab: true) },
                    showTabs: { showTabs = true },
                    showAssistant: { showAssistant = true },
                    showSettings: { showSettings = true },
                    swipe: { offset in withAnimation(.easeInOut(duration: 0.2)) { store.selectAdjacent(offset) } },
                    togglePin: { if let tab = store.selectedTab { store.togglePin(tab) } }
                )
            )
        }
        .background(theme.gradient.ignoresSafeArea())
        .tint(theme.accent)
        .animation(.easeInOut(duration: 0.3), value: store.currentSpaceID)
        .fullScreenCover(item: $commandBar, onDismiss: runPendingAsk) { request in
            CommandBar(request: request, tabs: store.tabsInCurrentSpace) { action in
                handle(action, newTab: request.newTab)
            }
            .tint(theme.accent)
        }
        .sheet(isPresented: $showTabs, onDismiss: {
            if pendingNewTab {
                pendingNewTab = false
                openCommandBar(newTab: true)
            }
        }) {
            TabSwitcher(onNewTab: {
                pendingNewTab = true
                showTabs = false
            })
            .environmentObject(store)
        }
        .sheet(isPresented: $showAssistant) {
            AssistantView(model: assistant)
                .environmentObject(store)
                .presentationDetents([.medium, .large])
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                .tint(theme.accent)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
    }

    private func openCommandBar(newTab: Bool) {
        let current = newTab ? "" : (store.selectedTab?.url?.absoluteString ?? "")
        commandBar = CommandBarRequest(newTab: newTab, initialText: current)
    }

    private func handle(_ action: CommandBar.Action, newTab: Bool) {
        switch action {
        case let .open(url):
            navigate(to: url, newTab: newTab)
        case let .search(query):
            navigate(to: AppSettings.searchEngine.url(for: query), newTab: newTab)
        case let .ask(question):
            pendingAsk = question
        case let .switchTo(tab):
            store.select(tab)
        }
    }

    private func navigate(to url: URL, newTab: Bool) {
        if !newTab, let tab = store.selectedTab {
            tab.load(url)
        } else {
            store.openTab(url)
        }
    }

    /// The assistant sheet can only appear once the command bar has finished dismissing.
    private func runPendingAsk() {
        guard let question = pendingAsk else { return }
        pendingAsk = nil
        assistant.send(question, store: store)
        showAssistant = true
    }
}

// MARK: - Bottom bar

struct BottomBarActions {
    var openAddress: () -> Void
    var newTab: () -> Void
    var showTabs: () -> Void
    var showAssistant: () -> Void
    var showSettings: () -> Void
    var swipe: (Int) -> Void
    var togglePin: () -> Void
}

private struct BarState {
    var host: String?
    var url: URL?
    var isSecure = true
    var progress: Double = 0
    var isLoading = false
    var canGoBack = false
    var canGoForward = false
    var isPinned = false

    @MainActor
    init(tab: BrowserTab?) {
        guard let tab else { return }
        host = tab.displayHost
        url = tab.url
        isSecure = tab.url?.scheme == "https"
        progress = tab.progress
        isLoading = tab.isLoading
        canGoBack = tab.canGoBack
        canGoForward = tab.canGoForward
        isPinned = tab.isPinned
    }
}

struct BottomBar: View {
    let tab: BrowserTab?
    let tabCount: Int
    let actions: BottomBarActions

    var body: some View {
        if let tab {
            ObservedBottomBar(tab: tab, tabCount: tabCount, actions: actions)
        } else {
            BottomBarLayout(tab: nil, state: BarState(tab: nil), tabCount: tabCount, actions: actions)
        }
    }
}

private struct ObservedBottomBar: View {
    @ObservedObject var tab: BrowserTab
    let tabCount: Int
    let actions: BottomBarActions

    var body: some View {
        BottomBarLayout(tab: tab, state: BarState(tab: tab), tabCount: tabCount, actions: actions)
    }
}

private struct BottomBarLayout: View {
    let tab: BrowserTab?
    let state: BarState
    let tabCount: Int
    let actions: BottomBarActions

    @GestureState private var dragOffset: CGFloat = 0

    var body: some View {
        HStack(spacing: 2) {
            BarButton(systemImage: "chevron.backward", isEnabled: state.canGoBack) { tab?.goBack() }
            addressPill
            BarButton(systemImage: "sparkles", action: actions.showAssistant)
            Button(action: actions.showTabs) {
                Text("\(min(tabCount, 99))")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .frame(width: 24, height: 24)
                    .overlay(RoundedRectangle(cornerRadius: 7).stroke(lineWidth: 2))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            menu
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 2)
    }

    private var addressPill: some View {
        HStack(spacing: 6) {
            if let host = state.host {
                Image(systemName: state.isSecure ? "lock.fill" : "exclamationmark.triangle.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(host)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
            } else {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("検索・URL・質問")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if let tab, state.url != nil {
                Button {
                    state.isLoading ? tab.stopLoading() : tab.reload()
                } label: {
                    Image(systemName: state.isLoading ? "xmark" : "arrow.clockwise")
                        .font(.footnote.weight(.semibold))
                        .frame(width: 28, height: 28)
                }
            }
        }
        .foregroundStyle(.primary)
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .overlay(alignment: .bottom) {
            if state.isLoading {
                GeometryReader { geo in
                    Capsule()
                        .fill(.tint)
                        .frame(width: max(8, geo.size.width * state.progress), height: 2.5)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 1)
                .animation(.linear(duration: 0.2), value: state.progress)
            }
        }
        .glassBackground(in: Capsule())
        .contentShape(Capsule())
        .offset(x: dragOffset * 0.25)
        .onTapGesture(perform: actions.openAddress)
        .gesture(
            // Arc-style: swipe the bar sideways to change tabs, swipe up to see all tabs.
            DragGesture(minimumDistance: 15)
                .updating($dragOffset) { value, offset, _ in offset = value.translation.width }
                .onEnded { value in
                    let dx = value.translation.width
                    let dy = value.translation.height
                    if abs(dx) > abs(dy), abs(dx) > 50 {
                        actions.swipe(dx < 0 ? 1 : -1)
                    } else if dy < -40 {
                        actions.showTabs()
                    }
                }
        )
    }

    private var menu: some View {
        Menu {
            if let tab {
                Button { tab.goForward() } label: {
                    Label("進む", systemImage: "chevron.forward")
                }
                .disabled(!state.canGoForward)
                Button(action: actions.togglePin) {
                    Label(state.isPinned ? "ピン留めを外す" : "ピン留め", systemImage: state.isPinned ? "pin.slash" : "pin")
                }
                if let url = state.url {
                    ShareLink(item: url) {
                        Label("共有", systemImage: "square.and.arrow.up")
                    }
                    Button { UIPasteboard.general.url = url } label: {
                        Label("リンクをコピー", systemImage: "link")
                    }
                }
                Divider()
            }
            Button(action: actions.newTab) {
                Label("新しいタブ", systemImage: "plus")
            }
            Button(action: actions.showSettings) {
                Label("設定", systemImage: "gearshape")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
    }
}
