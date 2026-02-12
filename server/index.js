const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./init-db');
const auth = require('./auth');
const push = require('./push');
const { normalizePhone, isValidPhone } = require('./phone');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Trust proxy (Fly.io等リバースプロキシ環境で必要) ---
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// --- Security Headers ---
app.use(helmet({
  contentSecurityPolicy: false, // CSPはフロントエンド側で制御
}));

// --- CORS ---
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || ORIGIN).split(',').map(s => s.trim());
app.use(cors({
  origin(origin, callback) {
    // 同一オリジン（origin=undefined）は許可
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// --- Rate Limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5,                    // 15分あたり5回まで（干支は12択なので厳しく）
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '認証試行回数が上限に達しました。しばらくしてからお試しください。' },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1分
  max: 60,                   // 1分あたり60回
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエスト回数が上限に達しました。' },
});

app.use('/api/auth/', authLimiter);
app.use('/api/', apiLimiter);

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
    SELECT id, phone, name, role, zodiac, created_at as registeredAt
    FROM members WHERE is_active = 1 ORDER BY created_at ASC
  `),
  getMemberByPhone: db.prepare(`
    SELECT id, phone, name, role, zodiac, created_at as registeredAt
    FROM members WHERE phone = ? AND is_active = 1
  `),
  deactivateMember: db.prepare(`
    UPDATE members SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),

  // Push subscriptions
  savePushSubscription: db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (member_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
  `),
};

// ============================================
// Auth Middleware
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

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ============================================
// Auth Routes (干支認証)
// ============================================

// POST /api/auth/login — 電話番号 + 干支で認証
app.post('/api/auth/login', (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const zodiac = req.body.zodiac?.trim()?.toLowerCase();
    if (!phone || !zodiac) {
      return res.status(400).json({ error: '電話番号と干支を入力してください' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '有効な携帯電話番号を入力してください' });
    }
    if (!auth.ZODIAC_SIGNS.includes(zodiac)) {
      return res.status(400).json({ error: '無効な干支です' });
    }
    const result = auth.authenticate(db, phone, zodiac);
    res.json(result);
  } catch (err) {
    console.error('auth/login error:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// POST /api/auth/verify — トークン検証（自動ログイン用）
app.post('/api/auth/verify', (req, res) => {
  const token = req.body.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }
  try {
    const payload = auth.verifyToken(token);
    // Fetch fresh user data
    const member = stmts.getMemberByPhone.get(payload.phone);
    if (!member) {
      return res.status(401).json({ error: 'User not found' });
    }
    // Re-sign a fresh token (extend expiry)
    const newToken = auth.signToken({ phone: member.phone, name: member.name, role: member.role });
    res.json({
      token: newToken,
      user: {
        id: member.id,
        phone: member.phone,
        name: member.name,
        role: member.role,
        registeredAt: member.registeredAt,
      },
    });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ============================================
// Admin: Member Management
// ============================================

// POST /api/admin/members — 管理者が会員を個別登録
app.post('/api/admin/members', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const name = req.body.name?.trim();
    const zodiac = auth.normalizeZodiac(req.body.zodiac);
    const role = req.body.role || 'member';

    if (!phone || !name || !zodiac) {
      return res.status(400).json({ error: '電話番号、名前、干支は必須です' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '有効な携帯電話番号を入力してください' });
    }
    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role は member または admin です' });
    }

    const member = auth.adminRegisterMember(db, phone, name, zodiac, role);
    res.json(member);
  } catch (err) {
    console.error('admin/members error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/members/import — CSV一括インポート
app.post('/api/admin/members/import', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows配列が必要です' });
    }

    // Normalize phones
    const normalized = rows.map(r => ({
      phone: normalizePhone(r.phone),
      name: r.name?.trim(),
      zodiac: r.zodiac?.trim(),
      role: r.role || 'member',
    }));

    const results = auth.adminBulkImport(db, normalized);
    res.json(results);
  } catch (err) {
    console.error('admin/members/import error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admin/members/:id — 会員無効化
app.delete('/api/admin/members/:id', authMiddleware, adminMiddleware, (req, res) => {
  const member = db.prepare('SELECT id, phone FROM members WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }
  stmts.deactivateMember.run(member.id);
  res.json({ ok: true, id: member.id });
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

// POST /api/messages — メッセージ作成（管理者のみ）
app.post('/api/messages', authMiddleware, adminMiddleware, async (req, res) => {
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

// DELETE /api/messages/:id — メッセージ削除（管理者のみ）
app.delete('/api/messages/:id', authMiddleware, adminMiddleware, (req, res) => {
  stmts.deleteMessage.run(req.params.id);
  res.json({ ok: true });
});

// POST /api/messages/:id/read — 既読マーク（認証必須）
app.post('/api/messages/:id/read', authMiddleware, (req, res) => {
  const phone = req.user.phone;
  stmts.markRead.run(req.params.id, phone);
  res.json({ ok: true });
});

// GET /api/members — 会員一覧（管理者のみ）
app.get('/api/members', authMiddleware, adminMiddleware, (req, res) => {
  const members = stmts.getMembers.all();
  res.json(members);
});

// PATCH /api/members/:id/role — ロール変更（管理者のみ）
app.patch('/api/members/:id/role', authMiddleware, adminMiddleware, (req, res) => {
  const { role } = req.body;
  if (!role || !['member', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be "member" or "admin"' });
  }
  const member = db.prepare('SELECT id, phone FROM members WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }
  db.prepare('UPDATE members SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, member.id);
  res.json({ ok: true, id: member.id, role });
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
    // Don't serve index.html for file requests (csv, json, images, etc.)
    if (req.path.includes('.')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ============================================
// Start
// ============================================
app.listen(PORT, () => {
  console.log(`町内会メッセンジャー API server running on http://localhost:${PORT}`);
});
