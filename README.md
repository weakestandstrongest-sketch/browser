# Kumo ☁️ — iPhoneで使える自分専用のAIブラウザ

Arc と Dia のアイデアを参考にした、iPhone 用の Web ブラウザです（SwiftUI + WebKit）。

## 主な機能

| 機能 | 参考元 | 内容 |
| --- | --- | --- |
| スペース | Arc | 「仕事」「趣味」などタブのまとまりを色付きで切り替え。タブ一覧で左右スワイプしても移動できる |
| ピン留めタブ | Arc | よく使うサイトをスタートページに固定 |
| 自動アーカイブ | Arc | ピン留めしていないタブは12時間（設定で変更可）使わないとアーカイブへ移動 |
| スワイプで操作 | Arc Search | 下のバーを左右にスワイプでタブ切替、上にスワイプでタブ一覧 |
| スマートアドレスバー | Dia | ひとつの入力欄でURL・検索・AIへの質問を判別（「?」で終わるとAIへの質問を優先） |
| ページとチャット | Dia | 表示中のページを要約・翻訳・質問。選択したテキストについても聞ける |
| タブとチャット | Dia | スペース内の全タブをまとめて比較・質問 |
| スキル | Dia | 「要約」「要点」「翻訳」「やさしく」「注意点」「比較」をワンタップで実行 |
| Liquid Glass | iOS 26 | iOS 26以降はガラス風のバー、それより前は半透明マテリアル |

AI 機能は Anthropic の Claude API を使います（デフォルトは Claude Opus 5.5。設定で Sonnet 5.5 / Haiku 5.5 に切り替え可能）。

## iPhoneで動かす手順

必要なもの: **Mac**、**Xcode 16 以降**（App Store から無料）、iPhone（iOS 17 以降）

1. このリポジトリを Mac にクローンして `Kumo.xcodeproj` をダブルクリック
2. Xcode 左側で「Kumo」プロジェクト →「Signing & Capabilities」→ **Team** に自分の Apple ID を選ぶ
   - Bundle Identifier がほかと重なるとエラーになるので、`app.kumo.browser` を `com.あなたの名前.kumo` などに変更
3. iPhone を USB で Mac に接続し、iPhone 側で **設定 → プライバシーとセキュリティ → デベロッパモード** をオン
4. Xcode 上部で接続した iPhone を選んで ▶︎（Run）
5. 初回は iPhone の **設定 → 一般 → VPNとデバイス管理** で自分の Apple ID を「信頼」

> 無料の Apple ID だとアプリは **7日間** で起動できなくなります（もう一度 Run すれば復活）。
> Apple Developer Program（年額 $99）に入ると1年有効になり、TestFlight でも配布できます。

## AI機能を使う

1. [console.anthropic.com](https://console.anthropic.com) で API キーを発行
2. アプリの「…」メニュー → 設定 → 「Anthropic APIキー」に貼り付けて保存
3. 下のバーの ✨ ボタン、またはアドレスバーに質問を入力

キーは iPhone のキーチェーンにだけ保存されます。利用料はキーのアカウントに従量課金されます。

## ファイル構成

```
Kumo/
├── App/KumoApp.swift            アプリのエントリーポイント
├── Browser/
│   ├── BrowserStore.swift       スペース・タブ・アーカイブの管理と保存
│   ├── BrowserTab.swift         1つのタブ（WKWebView）
│   ├── Space.swift              スペースとカラーテーマ
│   └── WebViewContainer.swift   WKWebView を SwiftUI に埋め込む
├── AI/
│   ├── ClaudeClient.swift       Claude API（ストリーミング）
│   ├── AssistantModel.swift     チャットの状態とスキル
│   └── PageExtractor.swift      開いているページから本文を抽出
├── Views/                       画面（メイン、アドレスバー、タブ一覧、AI、設定）
└── Support/                     設定値・キーチェーン・入力判定
```

## 今後のアイデア

- 広告ブロック（`WKContentRuleList`）
- 閲覧履歴と、履歴を使ったAI検索
- 分割表示（Arc の Split View）
- 「Browse for me」: AIが複数ページを読んで1ページにまとめる（Arc Search）
- ピン留めタブのフォルダ、スペースごとのログイン状態の分離
- iCloud でのタブ同期

## 注意

iOS では（EU以外）すべてのブラウザが Apple の WebKit エンジンを使う決まりがあるため、Kumo も Safari と同じ WebKit で表示しています。
