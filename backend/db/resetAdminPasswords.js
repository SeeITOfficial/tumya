const bcrypt = require("bcryptjs");
const db = require("./index");

const NEW_PASSWORD = "Elijah@2026";

async function run() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);

  const result = db.prepare(`
    UPDATE users
    SET password_hash = ?
    WHERE role = 'admin'
  `).run(hash);

  console.log(`Updated ${result.changes} admin account(s).`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});