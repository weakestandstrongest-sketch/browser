import SwiftUI

struct ArchivedTab: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String
    var url: URL
    var spaceID: UUID
    var archivedAt: Date
}

private struct TabRecord: Codable {
    var id: UUID
    var spaceID: UUID
    var isPinned: Bool
    var title: String
    var url: URL?
    var lastActive: Date
}

private struct PersistedState: Codable {
    var spaces: [Space]
    var tabs: [TabRecord]
    var archived: [ArchivedTab]
    var currentSpaceID: UUID
    var selectedTabBySpace: [UUID: UUID]
}

/// Owns spaces, tabs and the archive, and persists them to disk.
@MainActor
final class BrowserStore: ObservableObject {
    @Published private(set) var spaces: [Space]
    @Published private(set) var tabs: [BrowserTab] = []
    @Published private(set) var archived: [ArchivedTab] = []
    @Published private(set) var currentSpaceID: UUID
    @Published private var selectedTabBySpace: [UUID: UUID] = [:]

    private static let archiveLimit = 300

    init() {
        let home = Space(name: "ホーム", emoji: "🏠", theme: .ocean)
        spaces = [home]
        currentSpaceID = home.id
        load()
        archiveStaleTabs()
    }

    // MARK: - Queries

    var currentSpace: Space {
        spaces.first { $0.id == currentSpaceID } ?? spaces[0]
    }

    var tabsInCurrentSpace: [BrowserTab] { tabs(in: currentSpaceID) }

    /// Pinned tabs first, then the rest in the order they were opened.
    func tabs(in spaceID: UUID) -> [BrowserTab] {
        let inSpace = tabs.filter { $0.spaceID == spaceID }
        return inSpace.filter(\.isPinned) + inSpace.filter { !$0.isPinned }
    }

    var selectedTab: BrowserTab? {
        guard let id = selectedTabBySpace[currentSpaceID] else { return nil }
        return tabs.first { $0.id == id && $0.spaceID == currentSpaceID }
    }

    // MARK: - Tabs

    func select(_ tab: BrowserTab?) {
        selectedTab?.captureSnapshot()
        if let tab {
            currentSpaceID = tab.spaceID
            tab.lastActive = .now
            selectedTabBySpace[tab.spaceID] = tab.id
        } else {
            selectedTabBySpace[currentSpaceID] = nil
        }
    }

    @discardableResult
    func openTab(_ url: URL?, select shouldSelect: Bool = true) -> BrowserTab {
        let tab = BrowserTab(spaceID: currentSpaceID, url: url)
        tabs.append(tab)
        if shouldSelect { select(tab) }
        save()
        return tab
    }

    func close(_ tab: BrowserTab) {
        let ordered = tabs(in: tab.spaceID)
        let wasSelected = selectedTabBySpace[tab.spaceID] == tab.id
        archive(tab)
        tabs.removeAll { $0.id == tab.id }
        if wasSelected {
            let remaining = tabs(in: tab.spaceID)
            let index = ordered.firstIndex { $0.id == tab.id } ?? 0
            selectedTabBySpace[tab.spaceID] = remaining.isEmpty ? nil : remaining[max(0, min(index - 1, remaining.count - 1))].id
        }
        save()
    }

    func closeAllUnpinned() {
        for tab in tabs where tab.spaceID == currentSpaceID && !tab.isPinned { archive(tab) }
        tabs.removeAll { $0.spaceID == currentSpaceID && !$0.isPinned }
        if selectedTab == nil { selectedTabBySpace[currentSpaceID] = nil }
        save()
    }

    func togglePin(_ tab: BrowserTab) {
        objectWillChange.send()
        tab.isPinned.toggle()
        save()
    }

    func move(_ tab: BrowserTab, to space: Space) {
        guard tab.spaceID != space.id else { return }
        if selectedTabBySpace[tab.spaceID] == tab.id { selectedTabBySpace[tab.spaceID] = nil }
        objectWillChange.send()
        tab.spaceID = space.id
        save()
    }

    /// Used by the horizontal swipe on the address bar.
    func selectAdjacent(_ offset: Int) {
        let ordered = tabsInCurrentSpace
        guard !ordered.isEmpty else { return }
        guard let current = selectedTab, let index = ordered.firstIndex(where: { $0.id == current.id }) else {
            select(offset > 0 ? ordered.first : ordered.last)
            return
        }
        let next = index + offset
        if ordered.indices.contains(next) { select(ordered[next]) }
    }

    // MARK: - Spaces

    func switchTo(_ space: Space) {
        guard space.id != currentSpaceID else { return }
        selectedTab?.captureSnapshot()
        currentSpaceID = space.id
        save()
    }

    func addSpace(name: String, emoji: String, theme: SpaceTheme) {
        let space = Space(name: name, emoji: emoji, theme: theme)
        spaces.append(space)
        switchTo(space)
    }

    func deleteSpace(_ space: Space) {
        guard spaces.count > 1 else { return }
        for tab in tabs where tab.spaceID == space.id { archive(tab) }
        tabs.removeAll { $0.spaceID == space.id }
        spaces.removeAll { $0.id == space.id }
        selectedTabBySpace[space.id] = nil
        if currentSpaceID == space.id { currentSpaceID = spaces[0].id }
        save()
    }

    // MARK: - Archive (Arc-style auto archiving)

    /// Moves unpinned tabs that haven't been used for a while into the archive.
    func archiveStaleTabs() {
        let hours = AppSettings.archiveAfterHours
        guard hours > 0 else { return }
        let cutoff = Date.now.addingTimeInterval(-hours * 3600)
        let stale = tabs.filter { !$0.isPinned && $0.lastActive < cutoff }
        guard !stale.isEmpty else { return }
        for tab in stale { archive(tab) }
        let staleIDs = Set(stale.map(\.id))
        tabs.removeAll { staleIDs.contains($0.id) }
        selectedTabBySpace = selectedTabBySpace.filter { !staleIDs.contains($0.value) }
        save()
    }

    func restore(_ item: ArchivedTab) {
        archived.removeAll { $0.id == item.id }
        openTab(item.url)
    }

    func clearArchive() {
        archived.removeAll()
        save()
    }

    private func archive(_ tab: BrowserTab) {
        guard let url = tab.url else { return }
        archived.insert(ArchivedTab(title: tab.title, url: url, spaceID: tab.spaceID, archivedAt: .now), at: 0)
        if archived.count > Self.archiveLimit {
            archived.removeLast(archived.count - Self.archiveLimit)
        }
    }

    // MARK: - Persistence

    private var stateURL: URL {
        URL.applicationSupportDirectory.appending(path: "state.json")
    }

    func save() {
        let state = PersistedState(
            spaces: spaces,
            tabs: tabs.map {
                TabRecord(id: $0.id, spaceID: $0.spaceID, isPinned: $0.isPinned, title: $0.title, url: $0.url, lastActive: $0.lastActive)
            },
            archived: archived,
            currentSpaceID: currentSpaceID,
            selectedTabBySpace: selectedTabBySpace
        )
        do {
            try FileManager.default.createDirectory(at: .applicationSupportDirectory, withIntermediateDirectories: true)
            try JSONEncoder().encode(state).write(to: stateURL, options: .atomic)
        } catch {
            print("Kumo: failed to save state: \(error)")
        }
    }

    private func load() {
        guard let data = try? Data(contentsOf: stateURL),
              let state = try? JSONDecoder().decode(PersistedState.self, from: data),
              !state.spaces.isEmpty else { return }
        spaces = state.spaces
        tabs = state.tabs.map {
            BrowserTab(id: $0.id, spaceID: $0.spaceID, url: $0.url, title: $0.title, isPinned: $0.isPinned, lastActive: $0.lastActive)
        }
        archived = state.archived
        currentSpaceID = spaces.contains { $0.id == state.currentSpaceID } ? state.currentSpaceID : spaces[0].id
        selectedTabBySpace = state.selectedTabBySpace
    }
}
