# 町内会メッセンジャー

町内会・自治会向けのメッセージ一括配布Webアプリ。
パスワード不要、**電話番号＋干支（えと）**で認証。高齢者でもかんたん。

**本番URL**: https://chonaikai-messenger.fly.dev/

## 特徴

- **パスワードレス**: 電話番号 + 自分の干支を選ぶだけで認証
- **既読管理**: 管理者が誰が読んだか/読んでいないかをリアルタイム把握
- **高齢者対応**: シンプルなUI、干支の絵文字タップで直感操作
- **回覧板代替**: 重要度・カテゴリ別のメッセージ配信
- **Push通知**: 新しいお知らせをスマホにプッシュ通知（PWA対応）

## 認証の仕組み

住民は**電話番号**と**干支（12支）**の組み合わせで認証します。

- 干支は本人しか知らない「合言葉」として機能
- 3回間違えると30分間ロック（ブルートフォース対策）
- 認証成功でJWTトークン発行（30日有効）
- 2回目以降はトークン自動検証でログイン不要

```
ログイン画面:
 📱 電話番号入力 → 🐭🐮🐯🐰🐲🐍🐴🐏🐵🐔🐶🐗 から干支をタップ → ログイン完了
```

## 管理者向け：名簿管理ガイド

### 初回セットアップ（管理者アカウント作成）

サーバーのCLIから初期管理者を作成します:

```bash
# ローカル
node server/seed-admin.js --phone 09012345678 --name "山田太郎（会長）" --zodiac dragon

# Fly.io 本番
fly ssh console --app chonaikai-messenger -C "node server/seed-admin.js --phone 09012345678 --name '山田太郎（会長）' --zodiac dragon"
```

干支一覧: `rat(子)` `ox(丑)` `tiger(寅)` `rabbit(卯)` `dragon(辰)` `snake(巳)` `horse(午)` `sheep(未)` `monkey(申)` `rooster(酉)` `dog(戌)` `boar(亥)`

### 会員の個別追加（Web画面から）

1. 管理者アカウントでログイン
2. **「👥 会員」タブ** を開く
3. **「+ 会員追加」** ボタンをクリック
4. 電話番号・名前・干支・役割（一般/管理者）を入力して登録

### 会員のCSV一括登録

1. **「👥 会員」タブ** →  **「📄 CSV一括登録」** ボタン
2. CSVファイルを選択、またはテキスト欄に直接貼り付け
3. プレビュー確認後「インポート実行」

**CSVフォーマット:**
```csv
電話番号,名前,干支
09012345678,山田太郎（1丁目）,辰
08011112222,鈴木花子（2丁目）,うさぎ
07033334444,田中一郎（3丁目）,dog
```

- 干支は日本語（子/丑/寅...）、ひらがな（ねずみ/うし/とら...）、英語（rat/ox/tiger...）いずれもOK
- ヘッダー行（`電話番号,名前,干支`）は自動スキップ

### 会員の権限変更・削除

- **「👥 会員」タブ** の各会員カードから:
  - **「管理者に」/「権限解除」** — 管理者権限の昇格/降格
  - **「削除」** — 会員の無効化（確認ダイアログあり）

### メッセージ配信

1. **「📨 メッセージ」タブ** で右下の **✏️ ボタン** をタップ
2. タイトル・本文・重要度（緊急/重要/通常/お知らせ）・カテゴリを入力
3. 送信 → 全会員にPush通知が配信される

### 配信状況の確認

**「📊 配信状況」タブ** で:
- 配信数・登録会員数・平均既読率・緊急配信数のダッシュボード
- メッセージごとの既読率バー、既読者/未読者の名前一覧

## 技術スタック

```
フロントエンド: React + Vite (単一ファイル prototype-v2.jsx)
バックエンド:   Node.js + Express
データベース:   SQLite (better-sqlite3)
認証:           電話番号 + 干支 → SHA-256ハッシュ + JWT
通知:           Web Push (VAPID)
ホスティング:   Fly.io (東京リージョン nrt)
```

## プロジェクト構成

```
chonaikai-messenger/
├── server/
│   ├── index.js          ← Express APIサーバー
│   ├── auth.js           ← 干支認証 + JWT
│   ├── push.js           ← Web Push通知
│   ├── phone.js          ← 電話番号正規化
│   ├── init-db.js        ← DB初期化 + マイグレーション
│   └── seed-admin.js     ← 管理者ブートストラップCLI
├── src/
│   └── prototype-v2.jsx  ← フロントエンド（React）
├── public/
│   ├── sw.js             ← Service Worker (Push + オフラインキャッシュ)
│   ├── manifest.json     ← PWAマニフェスト
│   └── icon-*.png        ← PWAアイコン
├── docs/
│   └── schema.sql        ← DBスキーマ定義
├── Dockerfile            ← マルチステージビルド
├── fly.toml              ← Fly.ioデプロイ設定
└── .env.example          ← 環境変数テンプレート
```

## ローカル開発

```bash
npm install
npm run dev          # Vite開発サーバー (localhost:5173)
npm run dev:server   # APIサーバー (localhost:3000)
npm test             # テスト実行
npm run build        # 本番ビルド
```

## API エンドポイント

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| `POST` | `/api/auth/login` | - | 電話番号+干支でログイン |
| `POST` | `/api/auth/verify` | - | トークン検証（自動ログイン） |
| `GET` | `/api/messages` | - | メッセージ一覧 |
| `POST` | `/api/messages` | 管理者 | メッセージ作成 |
| `DELETE` | `/api/messages/:id` | 管理者 | メッセージ削除 |
| `POST` | `/api/messages/:id/read` | 会員 | 既読マーク |
| `GET` | `/api/members` | 管理者 | 会員一覧 |
| `PATCH` | `/api/members/:id/role` | 管理者 | 権限変更 |
| `POST` | `/api/admin/members` | 管理者 | 会員個別登録 |
| `POST` | `/api/admin/members/import` | 管理者 | CSV一括インポート |
| `DELETE` | `/api/admin/members/:id` | 管理者 | 会員削除 |
| `POST` | `/api/push/subscribe` | 会員 | Push通知登録 |

## 環境変数（本番）

```bash
# 必須
JWT_SECRET=<openssl rand -base64 32>
AUTH_SALT=<openssl rand -base64 32>

# Push通知
VAPID_PUBLIC_KEY=<npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<同上>
VAPID_SUBJECT=mailto:admin@example.com

# オリジン
ORIGIN=https://chonaikai-messenger.fly.dev
ALLOWED_ORIGINS=https://chonaikai-messenger.fly.dev
```
