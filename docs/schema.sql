-- ============================================
-- 町内会メッセンジャー データベーススキーマ
-- SQLite / PostgreSQL 互換
-- ============================================

-- 会員テーブル
CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           VARCHAR(15) UNIQUE NOT NULL,     -- 電話番号（E.164推奨）
  name            VARCHAR(100) NOT NULL,            -- 表示名（例: 山田太郎（3丁目））
  credential_id   TEXT,                             -- WebAuthn credential ID (base64url)
  public_key      TEXT,                             -- WebAuthn 公開鍵 (base64url)
  counter         INTEGER DEFAULT 0,               -- WebAuthn signature counter
  auth_method     VARCHAR(20) DEFAULT 'webauthn',  -- webauthn / pin / none
  role            VARCHAR(20) DEFAULT 'member',    -- member / admin
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  priority        VARCHAR(20) DEFAULT 'normal',    -- urgent / important / normal / info
  category        VARCHAR(20) DEFAULT 'general',   -- general / event / disaster / garbage / safety / other
  author_id       INTEGER REFERENCES members(id),
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 既読テーブル
CREATE TABLE IF NOT EXISTS reads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  read_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, member_id)
);

-- WebAuthn チャレンジ（一時保存、5分有効）
CREATE TABLE IF NOT EXISTS challenges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           VARCHAR(15) NOT NULL,
  challenge       TEXT NOT NULL,
  type            VARCHAR(20) NOT NULL,            -- registration / authentication
  expires_at      DATETIME NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Push通知サブスクリプション
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id, endpoint)
);

-- ============================================
-- インデックス
-- ============================================
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages(priority);
CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(category);
CREATE INDEX IF NOT EXISTS idx_reads_message ON reads(message_id);
CREATE INDEX IF NOT EXISTS idx_reads_member ON reads(member_id);
CREATE INDEX IF NOT EXISTS idx_challenges_phone ON challenges(phone);
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON challenges(expires_at);

-- ============================================
-- 初期データ（管理者アカウント）
-- ※ 本番では WebAuthn 登録後に role を admin に更新
-- ============================================
-- INSERT INTO members (phone, name, role) VALUES ('09012345678', '管理者', 'admin');

-- ============================================
-- 期限切れチャレンジの自動削除（定期実行推奨）
-- ============================================
-- DELETE FROM challenges WHERE expires_at < CURRENT_TIMESTAMP;
