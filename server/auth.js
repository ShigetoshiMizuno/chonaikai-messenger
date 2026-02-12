const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ---- Config ----
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '30d';
const AUTH_SALT = process.env.AUTH_SALT || 'chonaikai-default-salt';
const LOCKOUT_MINUTES = 30;
const MAX_ATTEMPTS = 3;

if (process.env.NODE_ENV === 'production') {
  if (JWT_SECRET === 'dev-secret-change-me') {
    console.warn('WARNING: JWT_SECRET is using default value. Set JWT_SECRET env var!');
  }
  if (AUTH_SALT === 'chonaikai-default-salt') {
    console.warn('WARNING: AUTH_SALT is using default value. Set AUTH_SALT env var!');
  }
}

// ---- 12干支 ----
const ZODIAC_SIGNS = [
  'rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake',
  'horse', 'sheep', 'monkey', 'rooster', 'dog', 'boar',
];

// 日本語→英語キーのマッピング
const ZODIAC_JP_MAP = {
  '子': 'rat', '丑': 'ox', '寅': 'tiger', '卯': 'rabbit',
  '辰': 'dragon', '巳': 'snake', '午': 'horse', '未': 'sheep',
  '申': 'monkey', '酉': 'rooster', '戌': 'dog', '亥': 'boar',
  'ねずみ': 'rat', 'うし': 'ox', 'とら': 'tiger', 'うさぎ': 'rabbit',
  'たつ': 'dragon', 'へび': 'snake', 'うま': 'horse', 'ひつじ': 'sheep',
  'さる': 'monkey', 'とり': 'rooster', 'いぬ': 'dog', 'いのしし': 'boar',
};

function normalizeZodiac(input) {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  if (ZODIAC_SIGNS.includes(lower)) return lower;
  return ZODIAC_JP_MAP[input.trim()] || null;
}

// ---- JWT ----
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ---- Auth Hash ----
function computeAuthHash(phone, zodiac) {
  return crypto.createHash('sha256').update(AUTH_SALT + phone + ':' + zodiac).digest('hex');
}

// ---- Rate Limiting (per-phone lockout) ----
function checkLockout(db, phone) {
  const row = db.prepare(
    'SELECT attempts, locked_until FROM auth_attempts WHERE phone = ?'
  ).get(phone);

  if (!row) return { locked: false };

  if (row.locked_until) {
    const lockedUntil = new Date(row.locked_until);
    if (lockedUntil > new Date()) {
      const remainMin = Math.ceil((lockedUntil - new Date()) / 60000);
      return { locked: true, remainMin };
    }
    // Lockout expired — reset
    db.prepare('UPDATE auth_attempts SET attempts = 0, locked_until = NULL WHERE phone = ?').run(phone);
    return { locked: false };
  }

  return { locked: false };
}

function recordFailedAttempt(db, phone) {
  const row = db.prepare('SELECT attempts FROM auth_attempts WHERE phone = ?').get(phone);
  if (!row) {
    db.prepare(
      'INSERT INTO auth_attempts (phone, attempts, last_attempt) VALUES (?, 1, CURRENT_TIMESTAMP)'
    ).run(phone);
    return 1;
  }

  const newAttempts = row.attempts + 1;
  if (newAttempts >= MAX_ATTEMPTS) {
    db.prepare(
      `UPDATE auth_attempts SET attempts = ?, locked_until = datetime('now', '+${LOCKOUT_MINUTES} minutes'), last_attempt = CURRENT_TIMESTAMP WHERE phone = ?`
    ).run(newAttempts, phone);
  } else {
    db.prepare(
      'UPDATE auth_attempts SET attempts = ?, last_attempt = CURRENT_TIMESTAMP WHERE phone = ?'
    ).run(newAttempts, phone);
  }
  return newAttempts;
}

function resetAttempts(db, phone) {
  db.prepare('DELETE FROM auth_attempts WHERE phone = ?').run(phone);
}

// ---- Authenticate (phone + zodiac → JWT) ----
function authenticate(db, phone, zodiac) {
  // Check lockout
  const lock = checkLockout(db, phone);
  if (lock.locked) {
    throw new Error(`アカウントがロックされています。${lock.remainMin}分後にお試しください。`);
  }

  // Find member
  const member = db.prepare(
    'SELECT id, phone, name, role, auth_hash, created_at as registeredAt FROM members WHERE phone = ? AND is_active = 1'
  ).get(phone);

  if (!member) {
    throw new Error('この電話番号は登録されていません。管理者にお問い合わせください。');
  }

  // Verify hash
  const hash = computeAuthHash(phone, zodiac);
  if (hash !== member.auth_hash) {
    const attempts = recordFailedAttempt(db, phone);
    const remaining = MAX_ATTEMPTS - attempts;
    if (remaining <= 0) {
      throw new Error(`干支が正しくありません。${LOCKOUT_MINUTES}分間ロックされます。`);
    }
    throw new Error(`干支が正しくありません。残り${remaining}回試行できます。`);
  }

  // Success — reset attempts
  resetAttempts(db, phone);

  const token = signToken({ phone: member.phone, name: member.name, role: member.role });
  return {
    token,
    user: {
      id: member.id,
      phone: member.phone,
      name: member.name,
      role: member.role,
      registeredAt: member.registeredAt,
    },
  };
}

// ---- Admin: Register a member ----
function adminRegisterMember(db, phone, name, zodiac, role = 'member') {
  if (!ZODIAC_SIGNS.includes(zodiac)) {
    throw new Error(`無効な干支: ${zodiac}`);
  }

  const authHash = computeAuthHash(phone, zodiac);

  const existing = db.prepare('SELECT id FROM members WHERE phone = ?').get(phone);
  if (existing) {
    db.prepare(
      'UPDATE members SET name = ?, zodiac = ?, auth_hash = ?, role = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE phone = ?'
    ).run(name, zodiac, authHash, role, phone);
    return db.prepare('SELECT id, phone, name, role, created_at as registeredAt FROM members WHERE phone = ?').get(phone);
  }

  db.prepare(
    'INSERT INTO members (phone, name, zodiac, auth_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(phone, name, zodiac, authHash, role);

  return db.prepare('SELECT id, phone, name, role, created_at as registeredAt FROM members WHERE phone = ?').get(phone);
}

// ---- Admin: Bulk import from CSV rows ----
function adminBulkImport(db, rows) {
  const results = { success: 0, errors: [] };

  const txn = db.transaction((rows) => {
    for (const row of rows) {
      try {
        const zodiac = normalizeZodiac(row.zodiac);
        if (!zodiac) {
          results.errors.push({ phone: row.phone, error: `無効な干支: ${row.zodiac}` });
          continue;
        }
        if (!row.phone || !row.name) {
          results.errors.push({ phone: row.phone || '(空)', error: '電話番号または名前が空です' });
          continue;
        }
        adminRegisterMember(db, row.phone, row.name, zodiac, row.role || 'member');
        results.success++;
      } catch (e) {
        results.errors.push({ phone: row.phone, error: e.message });
      }
    }
  });

  txn(rows);
  return results;
}

module.exports = {
  ZODIAC_SIGNS,
  ZODIAC_JP_MAP,
  normalizeZodiac,
  computeAuthHash,
  authenticate,
  adminRegisterMember,
  adminBulkImport,
  signToken,
  verifyToken,
  JWT_SECRET,
};
