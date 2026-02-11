# 実装タスクリスト

## Phase 1: プロジェクト基盤（1-2日）

- [ ] Vite + React プロジェクトセットアップ
- [ ] Tailwind CSS 導入
- [ ] プロトタイプv2のコードをコンポーネント分割
- [ ] Express サーバー雛形作成
- [ ] SQLite セットアップ + schema.sql 適用
- [ ] 環境変数設定（.env）: RP_ID, ORIGIN, JWT_SECRET

## Phase 2: WebAuthn認証（2-3日）

- [ ] `@simplewebauthn/server` + `@simplewebauthn/browser` 導入
- [ ] POST /api/auth/register/begin 実装
- [ ] POST /api/auth/register/complete 実装
- [ ] POST /api/auth/login/begin 実装
- [ ] POST /api/auth/login/complete 実装
- [ ] JWT発行 + ミドルウェア作成
- [ ] チャレンジの有効期限管理
- [ ] フロントエンド: 実WebAuthn APIとの接続
- [ ] WebAuthn非対応端末のフォールバック（電話番号+PIN）

## Phase 3: メッセージ機能（1-2日）

- [ ] GET /api/messages 実装
- [ ] POST /api/messages 実装（管理者認証付き）
- [ ] DELETE /api/messages/:id 実装
- [ ] POST /api/messages/:id/read 実装
- [ ] GET /api/messages/:id/reads 実装（管理者のみ）
- [ ] フロントエンド: API接続に切り替え

## Phase 4: 管理者機能（1日）

- [ ] GET /api/members 実装
- [ ] GET /api/stats 実装
- [ ] 管理者ロールの付与フロー（初期設定 or 招待）
- [ ] 管理者PIN → WebAuthn + ロール管理に移行

## Phase 5: プッシュ通知（2日）

- [ ] Service Worker 作成
- [ ] Web Push サブスクリプション登録
- [ ] POST /api/push/subscribe 実装
- [ ] メッセージ作成時の自動プッシュ通知
- [ ] 緊急メッセージの即時通知

## Phase 6: 仕上げ（2-3日）

- [ ] PWA化（manifest.json, Service Worker キャッシュ）
- [ ] レスポンシブデザイン確認
- [ ] 高齢者向けアクセシビリティ（フォントサイズ、コントラスト）
- [ ] エラーハンドリング
- [ ] HTTPS設定（Let's Encrypt）
- [ ] Rate limiting
- [ ] プライバシーポリシーページ
- [ ] 運用マニュアル作成

## Phase 7: 拡張（将来）

- [ ] SMS フォールバック通知（Twilio連携）
- [ ] 添付ファイル対応（画像・PDF）
- [ ] 返信・出欠リアクション機能
- [ ] 複数町内会対応（マルチテナント）
- [ ] 多言語対応
- [ ] データエクスポート（CSV）

## 技術的な注意点

1. **HTTPS必須**: WebAuthnはセキュアコンテキストのみで動作
2. **localhost例外**: 開発時はlocalhostならHTTPでも動作
3. **RP_ID設定**: 本番ドメインに合わせて設定必須
4. **SQLite → PostgreSQL**: 利用者数が増えたら移行検討
5. **1端末複数アカウント**: 家族共有端末への対応
6. **古い端末対応**: WebAuthn非対応時のPINフォールバック必須
