const db = require('./index');

const cols = db.prepare(`PRAGMA table_info(orders)`).all().map(c => c.name);

if (!cols.includes('delivery_lat')) {
  db.exec(`ALTER TABLE orders ADD COLUMN delivery_lat REAL`);
  console.log('added delivery_lat');
}
if (!cols.includes('delivery_lng')) {
  db.exec(`ALTER TABLE orders ADD COLUMN delivery_lng REAL`);
  console.log('added delivery_lng');
}
if (!cols.includes('delivery_address_text')) {
  db.exec(`ALTER TABLE orders ADD COLUMN delivery_address_text TEXT`);
  console.log('added delivery_address_text');
}
console.log('done');