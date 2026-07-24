const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "..", "data", "tumya.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some(column => column.name === columnName)) {
    db.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    );
  }
}

ensureColumn("catalog_items", "photo_url_2", "TEXT");
ensureColumn("orders", "delivery_lat", "REAL");
ensureColumn("orders", "delivery_lng", "REAL");
ensureColumn("orders", "delivery_address_text", "TEXT");

// node:sqlite has no built-in transaction() wrapper like better-sqlite3
db.transaction = (fn) => {
  return (...args) => {
    db.exec("BEGIN");

    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
};

module.exports = db;