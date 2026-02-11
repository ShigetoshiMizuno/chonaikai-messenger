const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');

// ---- Config ----
const RP_NAME = '町内会メッセンジャー';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '7d';
const CHALLENGE_TTL_MINUTES = 5;

// ---- JWT ----
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ---- Challenge helpers (synchronous, better-sqlite3) ----
function prepareStatements(db) {
  return {
    saveChallenge: db.prepare(`
      INSERT INTO challenges (phone, challenge, type, expires_at)
      VALUES (?, ?, ?, datetime('now', '+${CHALLENGE_TTL_MINUTES} minutes'))
    `),
    getChallenge: db.prepare(`
      SELECT challenge FROM challenges
      WHERE phone = ? AND type = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `),
    deleteChallenge: db.prepare(`
      DELETE FROM challenges WHERE phone = ? AND type = ?
    `),
    cleanupExpired: db.prepare(`
      DELETE FROM challenges WHERE expires_at < datetime('now')
    `),
  };
}

// ---- Registration Begin ----
async function registrationBegin(db, phone, name) {
  const stmts = prepareStatements(db);

  // Clean up any old challenges for this phone
  stmts.deleteChallenge.run(phone, 'registration');
  stmts.cleanupExpired.run();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: phone,
    userDisplayName: name,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
  });

  // Save challenge to DB
  stmts.saveChallenge.run(phone, options.challenge, 'registration');

  return options;
}

// ---- Registration Complete ----
async function registrationComplete(db, phone, name, response) {
  const stmts = prepareStatements(db);

  const row = stmts.getChallenge.get(phone, 'registration');
  if (!row) {
    throw new Error('チャレンジが見つかりません（期限切れの可能性があります）');
  }
  const expectedChallenge = row.challenge;

  // Delete challenge (one-time use)
  stmts.deleteChallenge.run(phone, 'registration');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn登録の検証に失敗しました');
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id; // base64url string
  const publicKey = Buffer.from(credential.publicKey).toString('base64url');
  const counter = credential.counter || 0;

  // Upsert member
  const existing = db.prepare('SELECT id FROM members WHERE phone = ? AND is_active = 1').get(phone);
  if (existing) {
    db.prepare(`
      UPDATE members SET name = ?, credential_id = ?, public_key = ?, counter = ?,
        auth_method = 'webauthn', updated_at = CURRENT_TIMESTAMP
      WHERE phone = ?
    `).run(name, credentialId, publicKey, counter, phone);
  } else {
    db.prepare(`
      INSERT INTO members (phone, name, credential_id, public_key, counter, auth_method)
      VALUES (?, ?, ?, ?, ?, 'webauthn')
    `).run(phone, name, credentialId, publicKey, counter);
  }

  const member = db.prepare(
    'SELECT id, phone, name, role, auth_method as method, created_at as registeredAt FROM members WHERE phone = ? AND is_active = 1'
  ).get(phone);

  const token = signToken({ phone: member.phone, name: member.name, role: member.role });

  return { token, user: member };
}

// ---- Authentication Begin ----
async function authenticationBegin(db, phone) {
  const stmts = prepareStatements(db);

  const member = db.prepare(
    'SELECT credential_id, public_key, counter FROM members WHERE phone = ? AND is_active = 1'
  ).get(phone);

  if (!member || !member.credential_id) {
    throw new Error('未登録または認証情報がありません');
  }

  // Clean up old challenges
  stmts.deleteChallenge.run(phone, 'authentication');
  stmts.cleanupExpired.run();

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: [{
      id: member.credential_id, // base64url string
      type: 'public-key',
      transports: ['internal'],
    }],
    userVerification: 'required',
  });

  stmts.saveChallenge.run(phone, options.challenge, 'authentication');

  return options;
}

// ---- Authentication Complete ----
async function authenticationComplete(db, phone, response) {
  const stmts = prepareStatements(db);

  const member = db.prepare(
    'SELECT id, phone, name, role, credential_id, public_key, counter, auth_method as method, created_at as registeredAt FROM members WHERE phone = ? AND is_active = 1'
  ).get(phone);

  if (!member || !member.credential_id) {
    throw new Error('未登録または認証情報がありません');
  }

  const row = stmts.getChallenge.get(phone, 'authentication');
  if (!row) {
    throw new Error('チャレンジが見つかりません（期限切れの可能性があります）');
  }
  const expectedChallenge = row.challenge;

  // Delete challenge (one-time use)
  stmts.deleteChallenge.run(phone, 'authentication');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: member.credential_id,
      publicKey: Buffer.from(member.public_key, 'base64url'),
      counter: member.counter || 0,
    },
  });

  if (!verification.verified) {
    throw new Error('WebAuthn認証の検証に失敗しました');
  }

  // Update counter
  const newCounter = verification.authenticationInfo.newCounter;
  db.prepare('UPDATE members SET counter = ?, updated_at = CURRENT_TIMESTAMP WHERE phone = ?')
    .run(newCounter, phone);

  const token = signToken({ phone: member.phone, name: member.name, role: member.role });

  return {
    token,
    user: {
      id: member.id,
      phone: member.phone,
      name: member.name,
      role: member.role,
      method: member.method,
      registeredAt: member.registeredAt,
    },
  };
}

module.exports = {
  registrationBegin,
  registrationComplete,
  authenticationBegin,
  authenticationComplete,
  signToken,
  verifyToken,
  JWT_SECRET,
  RP_ID,
  ORIGIN,
};
