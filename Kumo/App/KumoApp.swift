import SwiftUI

@main
struct KumoApp: App {
    @StateObject private var store = BrowserStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            BrowserView()
                .environmentObject(store)
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .background: store.save()
                    case .active: store.archiveStaleTabs()
                    default: break
                    }
                }
        }
    }
}
