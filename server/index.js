const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabase } = require('./init-db');
const auth = require('./auth');
const push = require('./push');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Database ---
const db = initDatabase();

// --- Push notification VAPID init ---
push.initVapidKeys();

// --- Prepared statements ---
const stmts = {
  // Messages
  getMessages: db.prepare(`
    SELECT id, title, body, priority, category, author_id, created_at as createdAt
    FROM messages WHERE is_deleted = 0 ORDER BY created_at DESC
  `),
  createMessage: db.prepare(`
    INSERT INTO messages (title, body, priority, category, author_id) VALUES (?, ?, ?, ?, ?)
  `),
  deleteMessage: db.prepare(`
    UPDATE messages SET is_deleted = 1 WHERE id = ?
  `),

  // Reads
  getReads: db.prepare(`
    SELECT r.message_id, r.read_at, m.phone, m.name
    FROM reads r JOIN members m ON r.member_id = m.id
  `),
  getReadsByMessage: db.prepare(`
    SELECT r.message_id, r.read_at as readAt, m.phone, m.name
    FROM reads r JOIN members m ON r.member_id = m.id
    WHERE r.message_id = ?
  `),
  markRead: db.prepare(`
    INSERT OR IGNORE INTO reads (message_id, member_id)
    SELECT ?, id FROM members WHERE phone = ?
  `),

  // Members
  getMembers: db.prepare(`
    SELECT id, phone, name, auth_method as method, credential_id as credentialId, created_at as registeredAt
    FROM members WHERE is_active = 1 ORDER BY created_at ASC
  `),
  getMemberByPhone: db.prepare(`
    SELECT id, phone, name, role, credential_id as credentialId, auth_method as method, created_at as registeredAt
    FROM members WHERE phone = ? AND is_active = 1
  `),

  // Push subscriptions
  savePushSubscription: db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (member_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
  `),
};

// ============================================
// JWT Auth Middleware
// ============================================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  try {
    req.user = auth.verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================
// WebAuthn Auth Routes
// ============================================

// POST /api/auth/register/begin
app.post('/api/auth/register/begin', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone || !name) {
      return res.status(400).json({ error: 'phone and name are required' });
    }
    const options = await auth.registrationBegin(db, phone, name);
    res.json(options);
  } catch (err) {
    console.error('register/begin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register/complete
app.post('/api/auth/register/complete', async (req, res) => {
  try {
    const { phone, name, response } = req.body;
    if (!phone || !name || !response) {
      return res.status(400).json({ error: 'phone, name, and response are required' });
    }
    const result = await auth.registrationComplete(db, phone, name, response);
    res.json(result);
  } catch (err) {
    console.error('register/complete error:', err);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login/begin
app.post('/api/auth/login/begin', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    const options = await auth.authenticationBegin(db, phone);
    res.json(options);
  } catch (err) {
    console.error('login/begin error:', err);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login/complete
app.post('/api/auth/login/complete', async (req, res) => {
  try {
    const { phone, response } = req.body;
    if (!phone || !response) {
      return res.status(400).json({ error: 'phone and response are required' });
    }
    const result = await auth.authenticationComplete(db, phone, response);
    res.json(result);
  } catch (err) {
    console.error('login/complete error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// Push Notification Routes
// ============================================

// GET /api/push/vapidPublicKey
app.get('/api/push/vapidPublicKey', (req, res) => {
  res.json({ key: push.getVapidPublicKey() });
});

// POST /api/push/subscribe
app.post('/api/push/subscribe', authMiddleware, (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const member = stmts.getMemberByPhone.get(req.user.phone);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  stmts.savePushSubscription.run(
    member.id,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth
  );
  res.json({ ok: true });
});

// ============================================
// API Routes
// ============================================

// GET /api/messages — メッセージ・既読・会員を一括取得
app.get('/api/messages', (req, res) => {
  const messages = stmts.getMessages.all();
  const members = stmts.getMembers.all();

  const readMap = {};
  for (const msg of messages) {
    readMap[msg.id] = stmts.getReadsByMessage.all(msg.id);
  }

  res.json({ messages, readMap, members });
});

// POST /api/messages — メッセージ作成（認証必須）
app.post('/api/messages', authMiddleware, async (req, res) => {
  const { title, body, priority, category } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  const member = stmts.getMemberByPhone.get(req.user.phone);
  const authorId = member ? member.id : null;

  const result = stmts.createMessage.run(title, body, priority || 'normal', category || 'general', authorId);
  const msg = {
    id: result.lastInsertRowid,
    title, body,
    priority: priority || 'normal',
    category: category || 'general',
    createdAt: new Date().toISOString(),
  };

  // Send push notification to all subscribers (fire and forget)
  const pri = { urgent: '🚨', important: '⚠️', normal: '📢', info: 'ℹ️' };
  push.sendPushToAll(db, {
    title: `${pri[msg.priority] || '📢'} ${msg.title}`,
    body: msg.body.slice(0, 100),
  }).catch(err => console.error('Push send error:', err));

  res.json(msg);
});

// DELETE /api/messages/:id — メッセージ削除（認証必須）
app.delete('/api/messages/:id', authMiddleware, (req, res) => {
  stmts.deleteMessage.run(req.params.id);
  res.json({ ok: true });
});

// POST /api/messages/:id/read — 既読マーク（認証必須）
app.post('/api/messages/:id/read', authMiddleware, (req, res) => {
  const phone = req.user.phone;
  stmts.markRead.run(req.params.id, phone);
  res.json({ ok: true });
});

// GET /api/members — 会員一覧（認証必須）
app.get('/api/members', authMiddleware, (req, res) => {
  const members = stmts.getMembers.all();
  res.json(members);
});

// ============================================
// Static file serving (production)
// ============================================
const distPath = path.join(__dirname, '..', 'dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { index: 'index.html' }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ============================================
// Start
// ============================================
app.listen(PORT, () => {
  console.log(`町内会メッセンジャー API server running on http://localhost:${PORT}`);
});
