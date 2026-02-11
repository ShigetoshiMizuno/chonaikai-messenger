# 町内会メッセンジャー - Claude Code 引き継ぎ資料

## 自動読み込み & Memory Rules (Non-Negotiable)

- .claude/handovers/ 内の handover-*.md があれば、**最新の日付のもの**を自動で最初に読み込み。
- セッション開始時に「最新HANDOVER（handover-YYYY-MM-DD.md）を読み込みました。ブランチxxx、優先タスク…」と報告。
- memory.md / key-learnings.md が存在したら、それも優先読み込み（長期累積知識）。
- Gotchas / Learningsは常に尊重。矛盾したら即確認。
- コンテキストが70%超えたら /handover を提案。
- secrets / tokens は絶対にHANDOVERやmemoryに書かない。

## その他永続ルール
（あなたのコーディングスタイル、避けるパターン、好みなどをここに）

## プロジェクト概要

町内会（自治会）向けのメッセージ一括配布Webアプリケーション。
LINEのようなSMSで回覧板の代わりにお知らせを一括配信し、
**ユーザーID/パスワード不要**で、電話番号＋端末生体認証（Face ID/指紋）により
既読・未読を管理できるシステム。

### ターゲットユーザー
- 町内会・自治会の住民（高齢者を含む）
- 管理者（町内会長・班長など）
- 規模: 数十〜数百世帯

### コンセプト
- パスワードレス認証（電話番号 + WebAuthn）
- 高齢者でも使える簡単なUI
- 回覧板の完全デジタル化
- 管理者が既読状況をリアルタイム把握

---

## 現在の状態

### 完成しているもの
- **プロトタイプv1** (`src/prototype-v1.jsx`): デバイスUUIDベースの既読管理
- **プロトタイプv2** (`src/prototype-v2.jsx`): 電話番号 + WebAuthn認証版（★メイン）
- どちらもReact単一ファイルで動作するフロントエンドプロトタイプ
- 永続化はブラウザ内ストレージ（`window.storage` API）で実装

### 未実装（本番化に必要）
- バックエンドAPI（Node.js or Python）
- データベース（PostgreSQL or SQLite）
- WebAuthn サーバーサイド検証
- プッシュ通知（Web Push / Service Worker）
- SMS連携（未読者へのフォールバック通知）

---

## アーキテクチャ方針

### 認証フロー

```
【初回登録】
① 電話番号入力（090-XXXX-XXXX）
② お名前入力（管理者向け表示名）
③ Face ID / 指紋で WebAuthn 登録
   → 端末内に秘密鍵生成、サーバーに公開鍵保存
④ 認証トークンをブラウザに保存

【2回目以降】
① アプリ起動 → 保存済みセッション検出
② 「おかえりなさい」画面 → Face ID / 指紋タップ
③ WebAuthn assertion → サーバー検証 → ログイン完了

【端末買い替え時】
① 電話番号を再入力
② 新端末で Face ID / 指紋を再登録
③ 電話番号ベースで既読履歴は継続
```

### 識別の仕組み
- **電話番号** = 「誰か」を特定する識別子（名簿突合可能）
- **WebAuthn** = 「本人か」を確認する認証手段（秘密鍵は端末外に出ない）
- **既読管理** = 電話番号ベース（端末変更しても追跡継続）

### 個体認証の技術比較（検討済み）

| 方式 | 精度 | ユーザー負担 | 採用 |
|------|------|------------|------|
| ブラウザ UUID | △ データ消去で消える | なし | v1で採用（簡易版） |
| FingerprintJS | ○ 60-70%（Pro版99.5%） | なし | 補助的に検討 |
| WebAuthn/FIDO2 | ◎ 暗号的に確実 | 生体認証タップ | ★v2で採用 |
| SMS認証 | ◎ 電話番号紐付き | SMS受信+入力 | 見送り（高齢者負担大） |
| 電話番号+PIN配布 | ○ | PIN入力 | 代替案として検討済み |

**結論**: 電話番号（識別子）+ WebAuthn（本人確認）のハイブリッドを採用。
SMS認証は高齢者の操作負担が大きいため、本人確認はデバイス側の生体認証に委ねる。

---

## 画面構成

### 住民側
1. **登録画面** - 3ステップ: 電話番号 → 名前 → 生体認証登録
2. **ログイン画面** - 「おかえりなさい」→ 生体認証でワンタップログイン
3. **メッセージ一覧** - 未読/既読表示、カテゴリフィルタ、タップで展開＋自動既読

### 管理者側（PIN: 1234 でログイン ← 本番では要変更）
1. **メッセージタブ** - 一覧表示、新規作成（FABボタン）
2. **配信状況タブ** - メッセージ別の既読率・既読者/未読者一覧
3. **会員タブ** - 登録端末一覧、電話番号・認証方式・既読数表示

### メッセージ属性
- **重要度**: 緊急🚨 / 重要⚠️ / 通常📢 / お知らせℹ️
- **カテゴリ**: 一般📋 / 行事🎌 / 防災🛡️ / ゴミ・清掃🧹 / 防犯🔒 / その他📎

---

## 本番実装の推奨スタック

### バックエンド
```
Node.js + Express (or Fastify)
├── @simplewebauthn/server  ← WebAuthn検証
├── PostgreSQL (or SQLite)   ← データ永続化
├── JWT (jsonwebtoken)       ← セッション管理
└── web-push                 ← プッシュ通知
```

### フロントエンド
```
React (Vite)
├── @simplewebauthn/browser  ← WebAuthn クライアント
├── Tailwind CSS             ← スタイリング
└── Service Worker           ← オフライン対応 + Push通知受信
```

### データベーススキーマ（案）

```sql
-- 会員テーブル
CREATE TABLE members (
  id            SERIAL PRIMARY KEY,
  phone         VARCHAR(15) UNIQUE NOT NULL,  -- 電話番号（識別子）
  name          VARCHAR(100) NOT NULL,         -- 表示名
  credential_id TEXT,                          -- WebAuthn credential ID
  public_key    TEXT,                          -- WebAuthn 公開鍵
  role          VARCHAR(20) DEFAULT 'member',  -- member / admin
  created_at    TIMESTAMP DEFAULT NOW()
);

-- メッセージテーブル
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  priority    VARCHAR(20) DEFAULT 'normal',   -- urgent/important/normal/info
  category    VARCHAR(20) DEFAULT 'general',  -- general/event/disaster/garbage/safety/other
  author_id   INTEGER REFERENCES members(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- 既読テーブル
CREATE TABLE reads (
  id         SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id),
  member_id  INTEGER REFERENCES members(id),
  read_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, member_id)
);

-- WebAuthn チャレンジ（一時保存）
CREATE TABLE challenges (
  id         SERIAL PRIMARY KEY,
  phone      VARCHAR(15) NOT NULL,
  challenge  TEXT NOT NULL,
  type       VARCHAR(20) NOT NULL,  -- registration / authentication
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API エンドポイント（案）

```
POST   /api/auth/register/begin     ← WebAuthn登録開始（チャレンジ生成）
POST   /api/auth/register/complete  ← WebAuthn登録完了（公開鍵保存）
POST   /api/auth/login/begin        ← WebAuthn認証開始
POST   /api/auth/login/complete      ← WebAuthn認証完了（JWT発行）

GET    /api/messages                 ← メッセージ一覧
POST   /api/messages                 ← メッセージ作成（管理者のみ）
DELETE /api/messages/:id             ← メッセージ削除（管理者のみ）

POST   /api/messages/:id/read       ← 既読マーク
GET    /api/messages/:id/reads       ← 既読状況取得（管理者のみ）

GET    /api/members                  ← 会員一覧（管理者のみ）
GET    /api/stats                    ← 統計ダッシュボード（管理者のみ）
```

---

## WebAuthn 実装のポイント

### サーバーサイド（@simplewebauthn/server）

```javascript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

// 登録開始
const options = await generateRegistrationOptions({
  rpName: '町内会メッセンジャー',
  rpID: 'yourdomain.com',
  userID: phoneNumber,
  userName: phoneNumber,
  userDisplayName: name,
  authenticatorSelection: {
    authenticatorAttachment: 'platform',  // 端末内蔵認証器
    userVerification: 'required',
    residentKey: 'required',
  },
});

// 認証検証
const verification = await verifyAuthenticationResponse({
  response: assertionResponse,
  expectedChallenge: savedChallenge,
  expectedOrigin: 'https://yourdomain.com',
  expectedRPID: 'yourdomain.com',
  authenticator: savedAuthenticator,
});
```

### クライアントサイド（@simplewebauthn/browser）

```javascript
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

// 登録
const options = await fetch('/api/auth/register/begin', { method: 'POST', body: JSON.stringify({ phone, name }) });
const attestation = await startRegistration(await options.json());
await fetch('/api/auth/register/complete', { method: 'POST', body: JSON.stringify(attestation) });

// 認証
const options = await fetch('/api/auth/login/begin', { method: 'POST', body: JSON.stringify({ phone }) });
const assertion = await startAuthentication(await options.json());
const result = await fetch('/api/auth/login/complete', { method: 'POST', body: JSON.stringify(assertion) });
```

---

## 将来の拡張案

1. **プッシュ通知**: Service Worker + Web Push API で緊急メッセージをリアルタイム通知
2. **SMS フォールバック**: Twilio連携で、一定時間未読の住民にSMS送信
3. **添付ファイル**: 回覧板PDF・画像の添付対応
4. **返信・リアクション**: 住民がメッセージに簡単な返答（出欠など）
5. **多言語対応**: 外国人住民向け自動翻訳
6. **PWA化**: ホーム画面追加でネイティブアプリ風に

---

## 開発者メモ

- 事業主: Nongsoft LLC（福岡）、代表: Shigetoshi
- 登録情報セキュリティスペシャリストとしてITサービスを提供
- ベンダーロックイン回避、顧客がシステムを完全コントロールできることを重視
- ターゲット: 5-30人規模のSME向けBCPソリューションの延長線上
- 「まるっとIT大先生」のPCサポートから関係構築→セキュリティ提案のエントリーポイントとして活用可能
