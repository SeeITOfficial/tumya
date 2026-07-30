// Run once after schema is applied: node db/seed.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./index');

function genPassword(length = 16) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function run() {
  const tx = db.transaction(() => {
    // Pickup point
    const existingPoint = db
      .prepare('SELECT id FROM pickup_points WHERE name = ?')
      .get('Kina Oil Petrol Station');

    if (!existingPoint) {
      db.prepare(`
        INSERT INTO pickup_points (name, area, landmark)
        VALUES (?, ?, ?)
      `).run(
        'Kina Oil Petrol Station',
        'Wakiso',
        'Main road junction'
      );

      console.log('Seeded pickup point.');
    }

    // Rate configuration
    const rates = [
      { direction: 'uganda_to_india', rate_per_kg: 650, currency: 'INR' },
      { direction: 'india_to_uganda', rate_per_kg: 10, currency: 'USD' }
    ];

    for (const r of rates) {
      const exists = db
        .prepare('SELECT 1 FROM rate_config WHERE direction = ?')
        .get(r.direction);

      if (!exists) {
        db.prepare(`
          INSERT INTO rate_config
          (direction, rate_per_kg, currency)
          VALUES (?, ?, ?)
        `).run(r.direction, r.rate_per_kg, r.currency);

        console.log(`Seeded ${r.direction}.`);
      }
    }

    // Admins
    const admins = [
      { name: 'Ssonko Stephen Elijah', phone: '0709877737' },
      { name: 'Shirat Nakuburwa', phone: '0757244016' },
      { name: 'Kimbowa Jacob', phone: '0748854693' }
    ];

    for (const admin of admins) {
      const exists = db
        .prepare('SELECT 1 FROM users WHERE phone = ?')
        .get(admin.phone);

      if (exists) continue;

      const password = genPassword();
      const hash = bcrypt.hashSync(password, 12);

      db.prepare(`
        INSERT INTO users
        (name, phone, password_hash, role)
        VALUES (?, ?, ?, 'admin')
      `).run(admin.name, admin.phone, hash);

      console.log(`
==================================================
ADMIN CREATED
Name     : ${admin.name}
Phone    : ${admin.phone}
Password : ${password}
==================================================
`);
    }
  });

  tx();

  console.log('Seed complete.');
}

run();