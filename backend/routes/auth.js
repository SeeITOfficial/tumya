const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  signToken,
  verifyPassword,
  requireAuth,
  requireAdmin,
} = require("../lib/auth");
const crypto = require('crypto');
const { sendVerificationCode } = require("../lib/email");

const isValidEmail = (email) => {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Six-digit numeric verification code.
const isValidOTP = (code) => {
  return typeof code === 'string' && /^\d{6}$/.test(code);
};

// Admin login — phone + password
router.post('/admin/login', (req, res) => {
  try {
    let { phone, password } = req.body;
    
    if (typeof phone === 'string') phone = phone.trim();

    if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });
    if (phone.length > 50) return res.status(400).json({ error: 'phone too long' });

    const user = db.prepare(`SELECT * FROM users WHERE phone = ? AND role = 'admin'`).get(phone);
    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    if (!token) return res.status(500).json({ error: 'Failed to sign token' });

    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', async (req, res) => {
  try {
    let { name, email, phone } = req.body;

    if (typeof name === 'string') name = name.trim();
    if (typeof email === 'string') email = email.trim().toLowerCase();
    if (typeof phone === 'string') phone = phone.trim();

    if (!name || !email || !phone) {
      return res.status(400).json({
        error: 'name, email and phone are required'
      });
    }

    if (name.length > 100 || email.length > 255 || phone.length > 50) {
      return res.status(400).json({ error: 'Input exceeds maximum length' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
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
        if (existingPhone.email) {
            return res.status(409).json({
                error: "Phone number already registered. Please sign in."
            });
        }
    }

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Ensure only one active OTP exists per email/purpose.
    db.prepare(`
      DELETE FROM email_verification_codes
      WHERE email = ? AND purpose = 'register'
    `).run(email);

    db.prepare(`
      INSERT INTO email_verification_codes
      (email, name, phone, code, purpose, expires_at)
      VALUES (?, ?, ?, ?, 'register', ?)
    `).run(email, name, phone, code, expiresAt);

    await sendVerificationCode(email, code);

    res.json({
        message: "Verification code sent to your email."
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify-email', (req, res) => {
  try {
    let { email, code } = req.body;

    if (typeof email === 'string') email = email.trim().toLowerCase();
    if (typeof code === 'string') code = code.trim();

    if (!email || !code) {
      return res.status(400).json({
        error: 'email and code are required'
      });
    }

    if (email.length > 255 || code.length > 10) {
      return res.status(400).json({ error: 'Input exceeds maximum length' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!isValidOTP(code)) {
      return res.status(400).json({ error: 'Invalid verification code format' });
    }

    db.prepare(`DELETE FROM email_verification_codes WHERE expires_at < ?`).run(new Date().toISOString());

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

    const existingUser = db.prepare(`
        SELECT *
        FROM users
        WHERE phone = ?
    `).get(record.phone);

    let user;

    if (existingUser) {
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

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const token = signToken(user);
    if (!token) return res.status(500).json({ error: 'Failed to sign token' });

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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async(req, res) => {
  try {
    let { email } = req.body;

    if (typeof email === 'string') email = email.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        error: 'email is required'
      });
    }

    if (email.length > 255) {
      return res.status(400).json({ error: 'Input exceeds maximum length' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post("/resend-code", async (req, res) => {
  try {
    let { email, purpose } = req.body;

    if (typeof email === 'string') email = email.trim().toLowerCase();
    if (typeof purpose === 'string') purpose = purpose.trim();

    if (!email || !purpose) {
        return res.status(400).json({
            error: "email and purpose are required"
        });
    }

    if (email.length > 255 || purpose.length > 50) {
      return res.status(400).json({ error: 'Input exceeds maximum length' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/verify-login', (req, res) => {
  try {
    let { email, code } = req.body;

    if (typeof email === 'string') email = email.trim().toLowerCase();
    if (typeof code === 'string') code = code.trim();

    if (!email || !code) {
      return res.status(400).json({
        error: 'email and code are required'
      });
    }

    if (email.length > 255 || code.length > 10) {
      return res.status(400).json({ error: 'Input exceeds maximum length' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!isValidOTP(code)) {
      return res.status(400).json({ error: 'Invalid verification code format' });
    }

    db.prepare(`DELETE FROM email_verification_codes WHERE expires_at < ?`).run(new Date().toISOString());

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

    db.prepare(`
      DELETE FROM email_verification_codes
      WHERE id = ?
    `).run(record.id);

    const token = signToken(user);
    if (!token) return res.status(500).json({ error: 'Failed to sign token' });

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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Admin: list all admin accounts (for reassign dropdown)
router.get('/admins', requireAuth, requireAdmin, (req, res) => {
  try {
    const admins = db.prepare(`SELECT id, name, phone FROM users WHERE role = 'admin' ORDER BY name`).all();
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

function generateVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

async function sendCode(email, purpose, name = null, phone = null) {
  try {
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`DELETE FROM email_verification_codes WHERE expires_at < ?`).run(new Date().toISOString());

    // Ensure only one active OTP exists per email/purpose.
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
  } catch (error) {
    throw error;
  }
}

module.exports = router;
