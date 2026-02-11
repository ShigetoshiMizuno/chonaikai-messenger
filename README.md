# 🏘️ 町内会メッセンジャー

町内会・自治会向けのメッセージ一括配布Webアプリ。
パスワード不要、電話番号＋生体認証（Face ID / 指紋）で参加・既読管理。

## 特徴

- **パスワードレス**: 電話番号 + Face ID/指紋（WebAuthn）で認証
- **既読管理**: 管理者が誰が読んだか/読んでいないかをリアルタイム把握
- **高齢者対応**: シンプルなUI、3ステップ登録
- **回覧板代替**: 重要度・カテゴリ別のメッセージ配信

## プロジェクト構成

```
chonaikai-messenger/
├── CLAUDE.md              ← Claude Code 引き継ぎ資料（★最初に読む）
├── README.md              ← このファイル
├── package.json           ← 依存パッケージ定義
├── src/
│   ├── prototype-v1.jsx   ← プロトタイプv1（UUID認証版）
│   └── prototype-v2.jsx   ← プロトタイプv2（電話番号+WebAuthn版）★メイン
└── docs/
    ├── DISCUSSION_LOG.md  ← 設計議論ログ・意思決定記録
    ├── WEBAUTHN_GUIDE.md  ← WebAuthn実装ガイド・コードサンプル
    ├── schema.sql         ← DBスキーマ定義
    └── TODO.md            ← 実装タスクリスト
```

## クイックスタート

現在はフロントエンドプロトタイプのみ。
`src/prototype-v2.jsx` をReact環境で実行すると動作確認可能。

## 次のステップ

`docs/TODO.md` 参照。バックエンドAPI → WebAuthn実装 → DB接続 の順で本番化。
