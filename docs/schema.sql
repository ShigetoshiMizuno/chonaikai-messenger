-- ============================================
-- 町内会メッセンジャー データベーススキーマ
-- SQLite / PostgreSQL 互換
-- 認証方式: 電話番号 + 干支
-- ============================================

-- 会員テーブル
CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           VARCHAR(15) UNIQUE NOT NULL,     -- 電話番号（E.164推奨）
  name            VARCHAR(100) NOT NULL,            -- 表示名（例: 山田太郎（3丁目））
  zodiac          VARCHAR(10),                      -- 干支 (rat/ox/tiger/rabbit/dragon/snake/horse/sheep/monkey/rooster/dog/boar)
  auth_hash       TEXT,                             -- SHA-256(SALT + phone + ':' + zodiac)
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

-- 認証試行テーブル（ブルートフォース対策）
CREATE TABLE IF NOT EXISTS auth_attempts (
  phone           VARCHAR(15) PRIMARY KEY,
  attempts        INTEGER DEFAULT 0,
  locked_until    DATETIME,
  last_attempt    DATETIME DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX IF NOT EXISTS idx_auth_attempts_locked ON auth_attempts(locked_until);
