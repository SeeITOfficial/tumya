const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { VAPID_PUBLIC, notifyAllCustomers } = require('../lib/push');

/**
 * GET /push/vapid-public-key
 * Returns the server's VAPID public key so the client can call PushManager.subscribe().
 * No authentication required.
 */
router.get('/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC) {
    return res.status(503).json({
      error: 'Push not configured on this server'
    });
  }

  res.json({
    key: VAPID_PUBLIC
  });
});

/**
 * POST /push/subscribe
 * Registers or updates a push subscription for the authenticated customer.
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 */
router.post('/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body;

  const cleanEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
  const cleanP256dh   = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const cleanAuth     = typeof keys?.auth    === 'string' ? keys.auth.trim()    : '';

  if (!cleanEndpoint || !keys || !cleanP256dh || !cleanAuth) {
    return res.status(400).json({
      error: 'endpoint and keys.p256dh/keys.auth required'
    });
  }

  try {
    db.prepare(`
      INSERT INTO push_subscriptions (
        customer_id,
        endpoint,
        p256dh,
        auth
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint)
      DO UPDATE SET
        customer_id = excluded.customer_id
    `).run(
      req.user.id,
      cleanEndpoint,
      cleanP256dh,
      cleanAuth
    );
  } catch (err) {
    console.error('push /subscribe db error:', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }

  res.status(201).json({
    ok: true
  });
});

/**
 * POST /push/unsubscribe
 * Removes a push subscription for the authenticated customer.
 * Body: { endpoint: string }
 */
router.post('/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body;

  const cleanEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';

  if (!cleanEndpoint) {
    return res.status(400).json({
      error: 'endpoint required'
    });
  }

  try {
    db.prepare(`
      DELETE FROM push_subscriptions
      WHERE endpoint = ?
        AND customer_id = ?
    `).run(cleanEndpoint, req.user.id);
  } catch (err) {
    console.error('push /unsubscribe db error:', err);
    return res.status(500).json({ error: 'Failed to remove subscription' });
  }

  res.json({
    ok: true
  });
});

/**
 * POST /push/admin/blast
 * Sends a push notification to all subscribed customers.
 * Body: { title: string, body: string, url?: string }
 */
router.post('/admin/blast', requireAuth, requireAdmin, async (req, res) => {
  const { title, body, url } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  const payload = { title, body, url: url || '/' };
  
  try {
    const result = await notifyAllCustomers(payload);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('push /admin/blast error:', err);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

module.exports = router;