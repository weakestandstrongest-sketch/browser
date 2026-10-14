import Foundation
import Security

/// Minimal Keychain wrapper for storing the Anthropic API key on device.
enum Keychain {
    private static let service = "app.kumo.browser"
    private static let apiKeyAccount = "anthropic-api-key"

    static var apiKey: String? {
        get { read(account: apiKeyAccount) }
        set {
            if let newValue, !newValue.isEmpty {
                write(newValue, account: apiKeyAccount)
            } else {
                delete(account: apiKeyAccount)
            }
        }
    }

    private static func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    private static func read(account: String) -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func write(_ value: String, account: String) {
        delete(account: account)
        var query = baseQuery(account: account)
        query[kSecValueData as String] = Data(value.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    private static func delete(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}
