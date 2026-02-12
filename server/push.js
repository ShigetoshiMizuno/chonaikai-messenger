const webpush = require('web-push');

// ---- VAPID Config ----
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

function initVapidKeys() {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('VAPID keys loaded from environment variables');
    return;
  }

  // Auto-generate keys for development
  const keys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = keys.publicKey;
  VAPID_PRIVATE_KEY = keys.privateKey;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  console.log('--- VAPID keys auto-generated (set these in env for production) ---');
  console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}`);
  } else {
    console.log('VAPID_PRIVATE_KEY=(hidden in production)');
  }
  console.log('-------------------------------------------------------------------');
}

function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

// ---- Push helpers ----

function preparePushStatements(db) {
  return {
    saveSubscription: db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (member_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
    `),
    getAllSubscriptions: db.prepare(`
      SELECT ps.endpoint, ps.p256dh, ps.auth, m.phone, m.name
      FROM push_subscriptions ps JOIN members m ON ps.member_id = m.id
      WHERE m.is_active = 1
    `),
    getSubscriptionsByMember: db.prepare(`
      SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?
    `),
    deleteSubscription: db.prepare(`
      DELETE FROM push_subscriptions WHERE endpoint = ?
    `),
    getUnreadSubscriptions: db.prepare(`
      SELECT ps.endpoint, ps.p256dh, ps.auth
      FROM push_subscriptions ps
      JOIN members m ON ps.member_id = m.id
      WHERE m.is_active = 1
        AND m.id NOT IN (SELECT member_id FROM reads WHERE message_id = ?)
    `),
  };
}

async function sendPushToAll(db, payload) {
  const stmts = preparePushStatements(db);
  const subs = stmts.getAllSubscriptions.all();
  const results = { sent: 0, failed: 0 };

  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      results.sent++;
    } catch (err) {
      results.failed++;
      // Remove invalid subscriptions (410 Gone, 404)
      if (err.statusCode === 410 || err.statusCode === 404) {
        stmts.deleteSubscription.run(sub.endpoint);
      }
    }
  }

  return results;
}

async function sendPushToUnread(db, messageId, payload) {
  const stmts = preparePushStatements(db);
  const subs = stmts.getUnreadSubscriptions.all(messageId);
  const results = { sent: 0, failed: 0 };

  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      results.sent++;
    } catch (err) {
      results.failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        stmts.deleteSubscription.run(sub.endpoint);
      }
    }
  }

  return results;
}

module.exports = {
  initVapidKeys,
  getVapidPublicKey,
  preparePushStatements,
  sendPushToAll,
  sendPushToUnread,
};
