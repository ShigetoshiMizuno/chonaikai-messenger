const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'chonaikai.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'docs', 'schema.sql');

function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  // --- Migrations: WebAuthn → 干支認証 ---
  migrate(db);

  return db;
}

function migrate(db) {
  const columns = db.prepare("PRAGMA table_info(members)").all().map(c => c.name);

  // Add zodiac/auth_hash columns if missing (migration from WebAuthn schema)
  if (!columns.includes('zodiac')) {
    console.log('Migration: Adding zodiac column to members');
    db.exec("ALTER TABLE members ADD COLUMN zodiac VARCHAR(10)");
  }
  if (!columns.includes('auth_hash')) {
    console.log('Migration: Adding auth_hash column to members');
    db.exec("ALTER TABLE members ADD COLUMN auth_hash TEXT");
  }

  // Create auth_attempts table if missing
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_attempts (
      phone VARCHAR(15) PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = { initDatabase, DB_PATH };
