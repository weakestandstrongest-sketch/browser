import SwiftUI
import WebKit

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppSettings.searchEngineKey) private var engine: SearchEngine = .google
    @AppStorage(AppSettings.modelKey) private var model: ClaudeModel = .opus
    @AppStorage(AppSettings.effortKey) private var effort: AIEffort = .low
    @AppStorage(AppSettings.archiveAfterHoursKey) private var archiveAfterHours: Double = 12

    @State private var apiKey = Keychain.apiKey ?? ""
    @State private var savedKey = Keychain.apiKey != nil
    @State private var showClearConfirm = false
    @State private var clearedData = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("sk-ant-...", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(savedKey ? "APIキーを更新" : "APIキーを保存") {
                        let trimmed = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
                        Keychain.apiKey = trimmed
                        savedKey = !trimmed.isEmpty
                    }
                    .disabled(apiKey.trimmingCharacters(in: .whitespaces).isEmpty)
                    if savedKey {
                        Button("APIキーを削除", role: .destructive) {
                            Keychain.apiKey = nil
                            apiKey = ""
                            savedKey = false
                        }
                    }
                } header: {
                    Text("Anthropic APIキー")
                } footer: {
                    Text("キーはこのiPhoneのキーチェーンにだけ保存されます。console.anthropic.com で発行できます。AIの利用料はこのキーのアカウントに課金されます。")
                }

                Section("AIアシスタント") {
                    Picker("モデル", selection: $model) {
                        ForEach(ClaudeModel.allCases) { Text($0.displayName).tag($0) }
                    }
                    Picker("考える深さ", selection: $effort) {
                        ForEach(AIEffort.allCases) { Text($0.label).tag($0) }
                    }
                }

                Section("ブラウジング") {
                    Picker("検索エンジン", selection: $engine) {
                        ForEach(SearchEngine.allCases) { Text($0.name).tag($0) }
                    }
                    Picker("タブの自動アーカイブ", selection: $archiveAfterHours) {
                        Text("12時間").tag(12.0)
                        Text("24時間").tag(24.0)
                        Text("7日間").tag(168.0)
                        Text("しない").tag(0.0)
                    }
                }

                Section {
                    Button(clearedData ? "削除しました" : "Cookie・キャッシュ・履歴を削除", role: .destructive) {
                        showClearConfirm = true
                    }
                    .disabled(clearedData)
                } footer: {
                    Text("ピン留めされていないタブは、指定時間使わないと自動でアーカイブに移動します（Arcと同じ仕組み）。")
                }
            }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("完了") { dismiss() } }
            }
            .confirmationDialog("すべてのサイトデータを削除しますか？", isPresented: $showClearConfirm, titleVisibility: .visible) {
                Button("削除", role: .destructive) {
                    WKWebsiteDataStore.default().removeData(
                        ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                        modifiedSince: .distantPast
                    ) {
                        clearedData = true
                    }
                }
            }
        }
    }
}
