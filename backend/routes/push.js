const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { VAPID_PUBLIC } = require('../lib/push');

// Public: frontend needs this to call PushManager.subscribe()
router.get('/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Push not configured on this server' });
  res.json({ key: VAPID_PUBLIC });
});

// Customer: register a push subscription
router.post('/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint and keys.p256dh/keys.auth required' });
  }

  db.prepare(
    `INSERT INTO push_subscriptions (customer_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET customer_id = excluded.customer_id`
  ).run(req.user.id, endpoint, keys.p256dh, keys.auth);

  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND customer_id = ?`).run(endpoint, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
