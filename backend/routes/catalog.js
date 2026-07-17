const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireAdmin } = require("../lib/auth");
const ALLOWED_STOCK_STATUS = ["in_stock", "out_of_stock", "coming_soon"];

// Public: list catalog items
router.get("/", (req, res) => {
  const items = db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all();
  res.json(items);
});

// Admin: create item
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, unit, price, stock_status, photo_url, photo_url_2 } = req.body;
  if (!name || !unit || price == null)
    return res.status(400).json({ error: "name, unit, price required" });
  if (stock_status && !ALLOWED_STOCK_STATUS.includes(stock_status)) {
    return res.status(400).json({
      error: "stock_status must be one of in_stock, out_of_stock, coming_soon",
    });
  }

  const result = db
    .prepare(
      `INSERT INTO catalog_items (name, unit, price, stock_status, photo_url, photo_url_2) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      unit,
      price,
      stock_status || "in_stock",
      photo_url || null,
      photo_url_2 || null,
    );
  res
    .status(201)
    .json(
      db
        .prepare(`SELECT * FROM catalog_items WHERE id = ?`)
        .get(result.lastInsertRowid),
    );
});

// Admin: update item (price, stock, photo)
router.patch("/:id", requireAuth, requireAdmin, (req, res) => {
  const { name, unit, price, stock_status, photo_url, photo_url_2 } = req.body;
  const item = db
    .prepare(`SELECT * FROM catalog_items WHERE id = ?`)
    .get(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (stock_status && !ALLOWED_STOCK_STATUS.includes(stock_status)) {
    return res.status(400).json({
      error: "stock_status must be one of in_stock, out_of_stock, coming_soon",
    });
  }

  db.prepare(
    `UPDATE catalog_items SET name = ?, unit = ?, price = ?, stock_status = ?, photo_url = ?, photo_url_2 = ? WHERE id = ?`,
  ).run(
    name ?? item.name,
    unit ?? item.unit,
    price ?? item.price,
    stock_status ?? item.stock_status,
    photo_url ?? item.photo_url,
    photo_url_2 ?? item.photo_url_2,
    req.params.id,
  );
  res.json(
    db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(req.params.id),
  );
});

// Admin: delete item
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const result = db
    .prepare(`DELETE FROM catalog_items WHERE id = ?`)
    .run(req.params.id);
  if (result.changes === 0)
    return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

module.exports = router;
