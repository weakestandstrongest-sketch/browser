import SwiftUI

/// An Arc-style Space: a separate set of tabs with its own color.
struct Space: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var emoji: String
    var theme: SpaceTheme
}

enum SpaceTheme: String, Codable, CaseIterable, Identifiable {
    case ocean, grape, sunset, forest, rose, midnight

    var id: String { rawValue }

    var colors: [Color] {
        switch self {
        case .ocean: [Color(red: 0.20, green: 0.48, blue: 0.96), Color(red: 0.30, green: 0.78, blue: 0.93)]
        case .grape: [Color(red: 0.47, green: 0.29, blue: 0.93), Color(red: 0.78, green: 0.42, blue: 0.95)]
        case .sunset: [Color(red: 0.98, green: 0.45, blue: 0.27), Color(red: 0.99, green: 0.72, blue: 0.30)]
        case .forest: [Color(red: 0.12, green: 0.58, blue: 0.42), Color(red: 0.45, green: 0.80, blue: 0.48)]
        case .rose: [Color(red: 0.93, green: 0.30, blue: 0.52), Color(red: 0.98, green: 0.58, blue: 0.66)]
        case .midnight: [Color(red: 0.13, green: 0.15, blue: 0.27), Color(red: 0.30, green: 0.33, blue: 0.50)]
        }
    }

    var accent: Color { colors[0] }

    var gradient: LinearGradient {
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
