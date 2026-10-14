import Combine
import SwiftUI
import WebKit

/// One browser tab. The WKWebView is created lazily so restored tabs don't all load at launch.
@MainActor
final class BrowserTab: NSObject, ObservableObject, Identifiable {
    let id: UUID
    @Published var spaceID: UUID
    @Published var isPinned: Bool
    @Published private(set) var title: String
    @Published private(set) var url: URL?
    @Published private(set) var progress: Double = 0
    @Published private(set) var isLoading = false
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var snapshot: UIImage?
    var lastActive: Date

    private var pendingURL: URL?
    private var _webView: WKWebView?
    private var cancellables: Set<AnyCancellable> = []

    init(id: UUID = UUID(), spaceID: UUID, url: URL?, title: String? = nil, isPinned: Bool = false, lastActive: Date = .now) {
        self.id = id
        self.spaceID = spaceID
        self.url = url
        self.pendingURL = url
        self.title = title ?? url?.host() ?? "新しいタブ"
        self.isPinned = isPinned
        self.lastActive = lastActive
        super.init()
    }

    var isLoaded: Bool { _webView != nil }

    var displayHost: String? {
        guard let host = url?.host() else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    var webView: WKWebView {
        if let existing = _webView { return existing }

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // Present as mobile Safari so sites serve their normal mobile layout.
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = self
        webView.uiDelegate = self
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(handleRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        bind(webView)
        _webView = webView

        if let pendingURL {
            self.pendingURL = nil
            // Deferred so we never publish changes in the middle of a SwiftUI view update.
            DispatchQueue.main.async { [weak webView] in
                webView?.load(URLRequest(url: pendingURL))
            }
        }
        return webView
    }

    func load(_ url: URL) {
        lastActive = .now
        if let webView = _webView {
            webView.load(URLRequest(url: url))
        } else {
            pendingURL = url
            self.url = url
        }
    }

    func goBack() { _webView?.goBack() }
    func goForward() { _webView?.goForward() }
    func reload() { _webView?.reload() }
    func stopLoading() { _webView?.stopLoading() }

    func captureSnapshot() {
        guard let webView = _webView, webView.window != nil else { return }
        webView.takeSnapshot(with: nil) { [weak self] image, _ in
            if let image { self?.snapshot = image }
        }
    }

    @objc private func handleRefresh(_ sender: UIRefreshControl) {
        _webView?.reload()
        sender.endRefreshing()
    }

    private func bind(_ webView: WKWebView) {
        // receive(on:) defers the initial values to the next run loop turn (see webView getter).
        webView.publisher(for: \.title).receive(on: DispatchQueue.main)
            .sink { [weak self] title in
                if let title, !title.isEmpty { self?.title = title }
            }
            .store(in: &cancellables)
        webView.publisher(for: \.url).receive(on: DispatchQueue.main)
            .sink { [weak self] url in
                if let url { self?.url = url }
            }
            .store(in: &cancellables)
        webView.publisher(for: \.estimatedProgress).receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.progress = $0 }
            .store(in: &cancellables)
        webView.publisher(for: \.isLoading).receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.isLoading = $0 }
            .store(in: &cancellables)
        webView.publisher(for: \.canGoBack).receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.canGoBack = $0 }
            .store(in: &cancellables)
        webView.publisher(for: \.canGoForward).receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.canGoForward = $0 }
            .store(in: &cancellables)
    }
}

extension BrowserTab: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .allow }
        if ["http", "https", "about", "blob", "data", "file", "javascript"].contains(scheme) { return .allow }
        // tel:, mailto:, App Store links, universal app schemes, ...
        _ = await UIApplication.shared.open(url, options: [:])
        return .cancel
    }

    /// Links with target="_blank" open in the same tab.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}
