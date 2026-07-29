const express = require('express');
const router = express.Router();
const db = require('../db');
const { signToken, verifyPassword } = require('../lib/auth');
const crypto = require('crypto');
const { sendVerificationCode } = require("../lib/email");


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

router.post('/register', async (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || !email || !phone) {
    return res.status(400).json({
      error: 'name, email and phone are required'
    });
  }

  const existingEmail = db.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).get(email);

  if (existingEmail) {
    return res.status(409).json({
      error: 'Email already registered'
    });
  }

  const existingPhone = db.prepare(`
      SELECT *
      FROM users
      WHERE phone = ?
  `).get(phone);

  if (existingPhone) {

      // This phone already belongs to an account
      // that already has an email.
      if (existingPhone.email) {
          return res.status(409).json({
              error: "Phone number already registered. Please sign in."
          });
      }

      // Otherwise it's an old phone-only account.
      // Allow email verification so we can upgrade it.
  }

  const code = generateVerificationCode();

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Remove any previous unused registration code for this email
  db.prepare(`
    DELETE FROM email_verification_codes
    WHERE email = ? AND purpose = 'register'
  `).run(email);

  // Save the new code
  db.prepare(`
    INSERT INTO email_verification_codes
    (email, name, phone, code, purpose, expires_at)
    VALUES (?, ?, ?, ?, 'register', ?)
  `).run(email, name, phone, code, expiresAt);

  await sendVerificationCode(email, code);

  res.json({
      message: "Verification code sent to your email."
  });
});

router.post('/verify-email', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      error: 'email and code are required'
    });
  }

  const record = db.prepare(`
    SELECT *
    FROM email_verification_codes
    WHERE email = ?
      AND code = ?
      AND purpose = 'register'
  `).get(email, code);

  if (!record) {
    return res.status(400).json({
      error: 'Invalid verification code'
    });
  }

  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({
      error: 'Verification code expired'
    });
  }

  // Does this phone already belong to a customer?
  const existingUser = db.prepare(`
      SELECT *
      FROM users
      WHERE phone = ?
  `).get(record.phone);

  let user;

  if (existingUser) {

      // Upgrade existing phone-only account
      db.prepare(`
          UPDATE users
          SET
              name = ?,
              email = ?,
              email_verified = 1
          WHERE phone = ?
      `).run(
          record.name,
          record.email,
          record.phone
      );

      user = db.prepare(`
          SELECT *
          FROM users
          WHERE phone = ?
      `).get(record.phone);

  } else {

      // Brand new customer
      const result = db.prepare(`
          INSERT INTO users
          (name, email, email_verified, phone)
          VALUES (?, ?, 1, ?)
      `).run(
          record.name,
          record.email,
          record.phone
      );

      user = db.prepare(`
          SELECT *
          FROM users
          WHERE id = ?
      `).get(result.lastInsertRowid);
  }

  db.prepare(`
      DELETE FROM email_verification_codes
      WHERE id = ?
  `).run(record.id);

  const token = signToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

router.post('/login', async(req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: 'email is required'
    });
  }

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(email);

  if (!user) {
    return res.status(404).json({
      error: 'Account not found'
    });
  }

  await sendCode(email, "login");

  res.json({
    message: "Verification code sent to your email."
  });
});


router.post("/resend-code", async (req, res) => {
    const { email, purpose } = req.body;

    if (!email || !purpose) {
        return res.status(400).json({
            error: "email and purpose are required"
        });
    }

    if (!["register", "login"].includes(purpose)) {
        return res.status(400).json({
            error: "Invalid purpose"
        });
    }

    let record = null;

    if (purpose === "register") {
        record = db.prepare(`
            SELECT *
            FROM email_verification_codes
            WHERE email = ?
              AND purpose = 'register'
        `).get(email);

        if (!record) {
            return res.status(404).json({
                error: "Registration not found"
            });
        }

        await sendCode(email, "register", record.name, record.phone);
    } else {
        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        await sendCode(email, "login");
    }

    res.json({
        message: "Verification code resent."
    });
});


router.post('/verify-login', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      error: 'email and code are required'
    });
  }

  const record = db.prepare(`
    SELECT *
    FROM email_verification_codes
    WHERE email = ?
      AND code = ?
      AND purpose = 'login'
  `).get(email, code);

  if (!record) {
    return res.status(400).json({
      error: 'Invalid verification code'
    });
  }

  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({
      error: 'Verification code expired'
    });
  }

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(email);

  db.prepare(`
    DELETE FROM email_verification_codes
    WHERE id = ?
  `).run(record.id);

  const token = signToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

const { requireAuth, requireAdmin } = require('../lib/auth');

// Admin: list all admin accounts (for reassign dropdown)
router.get('/admins', requireAuth, requireAdmin, (req, res) => {
  const admins = db.prepare(`SELECT id, name, phone FROM users WHERE role = 'admin' ORDER BY name`).all();
  res.json(admins);
});

function generateVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

async function sendCode(email, purpose, name = null, phone = null) {
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
        DELETE FROM email_verification_codes
        WHERE email = ?
          AND purpose = ?
    `).run(email, purpose);

    db.prepare(`
        INSERT INTO email_verification_codes
        (email, name, phone, code, purpose, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(email, name, phone, code, purpose, expiresAt);

    await sendVerificationCode(email, code);
}

module.exports = router;
