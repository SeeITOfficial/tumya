const db = require('./index');

const columns = new Set(
  db.prepare('PRAGMA table_info(orders)').all().map(c => c.name)
);

const migrations = [
  ['delivery_lat', 'REAL'],
  ['delivery_lng', 'REAL'],
  ['delivery_address_text', 'TEXT']
];

const tx = db.transaction(() => {
  for (const [name, type] of migrations) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
      console.log(`Added ${name}`);
    }
  }
});

tx();

console.log('Migration complete.');