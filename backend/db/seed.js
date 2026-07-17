// Run once after schema is applied: node db/seed.js
const bcrypt = require('bcryptjs');
const db = require('./index');

function run() {
  // Pickup point
  const existingPoint = db.prepare('SELECT id FROM pickup_points WHERE name = ?').get('Kina Oil Petrol Station');
  if (!existingPoint) {
    db.prepare(
      `INSERT INTO pickup_points (name, area, landmark) VALUES (?, ?, ?)`
    ).run('Kina Oil Petrol Station', 'Wakiso', 'Main road junction');
    console.log('Seeded pickup point: Kina Oil Petrol Station, Wakiso');
  }

  // Rate config
  const rates = [
    { direction: 'uganda_to_india', rate_per_kg: 650, currency: 'INR' },
    { direction: 'india_to_uganda', rate_per_kg: 10, currency: 'USD' },
  ];
  for (const r of rates) {
    const existing = db.prepare('SELECT direction FROM rate_config WHERE direction = ?').get(r.direction);
    if (!existing) {
      db.prepare(
        `INSERT INTO rate_config (direction, rate_per_kg, currency) VALUES (?, ?, ?)`
      ).run(r.direction, r.rate_per_kg, r.currency);
      console.log(`Seeded rate: ${r.direction} = ${r.rate_per_kg} ${r.currency}/kg`);
    }
  }

  // Admin accounts — passwords are randomly generated and printed once below.
  // Save them immediately (e.g. in a password manager) — they are not stored anywhere else in plain text.
  const crypto = require('crypto');
  function genPassword() {
    return crypto.randomBytes(6).toString('base64url'); // 8-char url-safe password
  }

  const admins = [
    { name: 'Ssonko Stephen Elijah', phone: '0709877737' },
    { name: 'Shirat Nakuburwa', phone: '0757244016' },
    { name: 'Kimbowa Jacob', phone: '0748854693' },
  ];
  for (const a of admins) {
    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(a.phone);
    if (!existing) {
      const password = genPassword();
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(
        `INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'admin')`
      ).run(a.name, a.phone, hash);
      console.log(`Seeded admin: ${a.name} (${a.phone}) — password: ${password}  <-- SAVE THIS NOW, shown once`);
    }
  }

  console.log('Seed complete.');
}

run();
