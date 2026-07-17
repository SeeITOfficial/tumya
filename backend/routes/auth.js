const express = require('express');
const router = express.Router();
const db = require('../db');
const { signToken, verifyPassword } = require('../lib/auth');

// Admin login — phone + password
router.post('/admin/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });

  const user = db.prepare(`SELECT * FROM users WHERE phone = ? AND role = 'admin'`).get(phone);
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
});

// Customer identify — v1 has no OTP, just registers/looks up by phone.
// NOTE: this means anyone entering a known phone number is treated as that customer.
// Fine for a trusted-community v1; add OTP before this handles strangers/high-value fraud risk.
router.post('/customer/identify', (req, res) => {
  const { phone, name } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  let user = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone);
  if (!user) {
    if (!name) return res.status(400).json({ error: 'name required for new customer' });
    const result = db.prepare(`INSERT INTO users (name, phone, role) VALUES (?, ?, 'customer')`).run(name, phone);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid);
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
});

const { requireAuth, requireAdmin } = require('../lib/auth');

// Admin: list all admin accounts (for reassign dropdown)
router.get('/admins', requireAuth, requireAdmin, (req, res) => {
  const admins = db.prepare(`SELECT id, name, phone FROM users WHERE role = 'admin' ORDER BY name`).all();
  res.json(admins);
});

module.exports = router;
