const webpush = require('web-push');
const db = require('../db');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim();
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();
const VAPID_CONTACT =
  process.env.VAPID_CONTACT_EMAIL?.trim() || 'mailto:admin@tumya.app';

const PUSH_ENABLED = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);

if (PUSH_ENABLED) {
  webpush.setVapidDetails(
    VAPID_CONTACT,
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
} else {
  console.warn(
    'WARNING: Push notifications are disabled. Missing VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY.'
  );
}

async function notifyCustomer(customerId, payload) {
  if (!PUSH_ENABLED) return;

  if (!customerId || !payload) return;

  const subscriptions = db
    .prepare(
      `
      SELECT *
      FROM push_subscriptions
      WHERE customer_id = ?
    `
    )
    .all(customerId);

  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  for (const sub of subscriptions) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(subscription, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare(
          `
          DELETE FROM push_subscriptions
          WHERE id = ?
        `
        ).run(sub.id);
      } else {
        console.error(
          `Push notification failed for customer ${customerId}:`,
          err.message
        );
      }
    }
  }
}

async function notifyAllCustomers(payload) {
  if (!PUSH_ENABLED || !payload) return;

  const subscriptions = db.prepare(`SELECT * FROM push_subscriptions`).all();
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    try {
      await webpush.sendNotification(subscription, body);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
      }
    }
  }

  console.log(`Push blast complete. Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

module.exports = {
  notifyCustomer,
  notifyAllCustomers,
  VAPID_PUBLIC,
  PUSH_ENABLED,
};