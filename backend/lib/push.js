const webpush = require('web-push');
const db = require('../db');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@tumya.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('WARNING: VAPID keys not set — push notifications disabled. Generate with: npx web-push generate-vapid-keys');
}

async function notifyCustomer(customerId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return; // silently no-op if not configured

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE customer_id = ?').all(customerId);
  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
      // Expired/invalid subscription — clean it up so we stop trying
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } else {
        console.error('Push send failed:', err.message);
      }
    }
  }
}

module.exports = { notifyCustomer, VAPID_PUBLIC };
