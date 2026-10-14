import Foundation

/// UserDefaults keys and typed accessors for app settings.
enum AppSettings {
    static let searchEngineKey = "searchEngine"
    static let modelKey = "claudeModel"
    static let effortKey = "aiEffort"
    static let archiveAfterHoursKey = "archiveAfterHours"

    static var searchEngine: SearchEngine {
        UserDefaults.standard.string(forKey: searchEngineKey).flatMap(SearchEngine.init(rawValue:)) ?? .google
    }

    static var model: ClaudeModel {
        UserDefaults.standard.string(forKey: modelKey).flatMap(ClaudeModel.init(rawValue:)) ?? .opus
    }

    static var effort: AIEffort {
        UserDefaults.standard.string(forKey: effortKey).flatMap(AIEffort.init(rawValue:)) ?? .low
    }

    /// 0 means "never archive".
    static var archiveAfterHours: Double {
        UserDefaults.standard.object(forKey: archiveAfterHoursKey) as? Double ?? 12
    }
}

enum SearchEngine: String, CaseIterable, Identifiable {
    case google, duckDuckGo, bing, ecosia

    var id: String { rawValue }

    var name: String {
        switch self {
        case .google: "Google"
        case .duckDuckGo: "DuckDuckGo"
        case .bing: "Bing"
        case .ecosia: "Ecosia"
        }
    }

    func url(for query: String) -> URL {
        var components: URLComponents
        switch self {
        case .google: components = URLComponents(string: "https://www.google.com/search")!
        case .duckDuckGo: components = URLComponents(string: "https://duckduckgo.com/")!
        case .bing: components = URLComponents(string: "https://www.bing.com/search")!
        case .ecosia: components = URLComponents(string: "https://www.ecosia.org/search")!
        }
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        return components.url!
    }
}

enum ClaudeModel: String, CaseIterable, Identifiable {
    case opus = "claude-opus-5-5"
    case sonnet = "claude-sonnet-5-5"
    case haiku = "claude-haiku-5-5"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .opus: "Claude Opus 5.5（高性能）"
        case .sonnet: "Claude Sonnet 5.5（バランス）"
        case .haiku: "Claude Haiku 5.5（高速・低コスト）"
        }
    }

    /// Server-side refusal fallback (`fallbacks: "default"`) is offered for Opus and Sonnet only.
    var supportsServerFallback: Bool { self != .haiku }
}

enum AIEffort: String, CaseIterable, Identifiable {
    case low, medium, high

    var id: String { rawValue }

    var label: String {
        switch self {
        case .low: "速さ優先"
        case .medium: "バランス"
        case .high: "じっくり考える"
        }
    }
}
