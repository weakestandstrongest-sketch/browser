import SwiftUI

extension View {
    /// Liquid Glass on iOS 26+, material blur on earlier versions.
    @ViewBuilder
    func glassBackground<S: Shape>(in shape: S) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
        #else
        self.background(.ultraThinMaterial, in: shape)
        #endif
    }
}

struct FaviconView: View {
    let url: URL?
    var size: CGFloat = 18

    private var iconURL: URL? {
        guard let host = url?.host() else { return nil }
        return URL(string: "https://icons.duckduckgo.com/ip3/\(host).ico")
    }

    var body: some View {
        AsyncImage(url: iconURL) { image in
            image.resizable().scaledToFit()
        } placeholder: {
            Image(systemName: "globe")
                .resizable()
                .scaledToFit()
                .foregroundStyle(.secondary)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
    }
}

/// Round icon button used in the bottom bar.
struct BarButton: View {
    let systemImage: String
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.4)
    }
}
