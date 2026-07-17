const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const db = new DatabaseSync(
  path.join(__dirname, "..", "data", "tumya.db")
);

const items = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "catalog-backup.json"),
    "utf8"
  )
);

const insert = db.prepare(`
INSERT INTO catalog_items
(
    id,
    name,
    unit,
    price,
    stock_status,
    photo_url,
    photo_url_2,
    created_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec("BEGIN");

for (const item of items) {

    insert.run(
        item.id,
        item.name,
        item.unit,
        item.price,
        item.stock_status || "in_stock",
        item.photo_url || null,
        item.photo_url_2 || null,
        item.created_at
    );

}

db.exec("COMMIT");

console.log(`Imported ${items.length} catalog items.`);