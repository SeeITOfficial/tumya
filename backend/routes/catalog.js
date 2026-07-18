const express = require("express");
const router = express.Router();
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { requireAuth, requireAdmin } = require("../lib/auth");
const ALLOWED_STOCK_STATUS = ["in_stock", "out_of_stock", "coming_soon"];
const { upload, saveImage } = require("../lib/upload");
// Public: list catalog items
router.get("/", (req, res) => {
  const items = db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all();
  res.json(items);
});

// Admin: create item
router.post(
  "/",
  requireAuth,
  requireAdmin,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "photo2", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { name, unit, price, stock_status } = req.body;

      if (!name || !unit || price == null) {
        return res.status(400).json({
          error: "name, unit, price required",
        });
      }

      let photo_url = null;
      let photo_url_2 = null;

      if (req.files?.photo?.[0]) {
        photo_url = await saveImage(req.files.photo[0]);
      }

      if (req.files?.photo2?.[0]) {
        photo_url_2 = await saveImage(req.files.photo2[0]);
      }

      
      const result = db.prepare(`
        INSERT INTO catalog_items
        (name, unit, price, stock_status, photo_url, photo_url_2)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        name,
        unit,
        price,
        stock_status || "in_stock",
        photo_url,
        photo_url_2
      );

      res.status(201).json(
        db.prepare(
          "SELECT * FROM catalog_items WHERE id=?"
        ).get(result.lastInsertRowid)
      );

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save image." });
    }
  }
);

// Admin: update item (price, stock, photo)
router.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "photo2", maxCount: 1 },
  ]),
  
  async (req, res) => {
    try {
      const item = db
        .prepare("SELECT * FROM catalog_items WHERE id = ?")
        .get(req.params.id);

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const {
        name,
        unit,
        price,
        stock_status,
      } = req.body;

      if (
        stock_status &&
        !ALLOWED_STOCK_STATUS.includes(stock_status)
      ) {
        return res.status(400).json({
          error:
            "stock_status must be one of in_stock, out_of_stock, coming_soon",
        });
      }

      let photo_url = item.photo_url;
      let photo_url_2 = item.photo_url_2;

      if (req.files?.photo?.[0]) {
          const old = item.photo_url;

          photo_url = await saveImage(req.files.photo[0]);

          deleteCatalogImage(old);
      }

      if (req.files?.photo2?.[0]) {
          const old = item.photo_url_2;

          photo_url_2 = await saveImage(req.files.photo2[0]);

          deleteCatalogImage(old);
      }

      db.prepare(`
        UPDATE catalog_items
        SET
          name = ?,
          unit = ?,
          price = ?,
          stock_status = ?,
          photo_url = ?,
          photo_url_2 = ?
        WHERE id = ?
      `).run(
        name ?? item.name,
        unit ?? item.unit,
        price ?? item.price,
        stock_status ?? item.stock_status,
        photo_url,
        photo_url_2,
        req.params.id
      );

      res.json(
        db.prepare(
          "SELECT * FROM catalog_items WHERE id = ?"
        ).get(req.params.id)
      );

    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to update item."
      });
    }
  }
);
// Admin: delete item
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const item = db
    .prepare("SELECT * FROM catalog_items WHERE id=?")
    .get(req.params.id);

  if (!item)
    return res.status(404).json({ error: "Item not found" });

  deleteCatalogImage(item.photo_url);
  deleteCatalogImage(item.photo_url_2);
  
  const result = db
    .prepare(`DELETE FROM catalog_items WHERE id = ?`)
    .run(req.params.id);
  if (result.changes === 0)
    return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

function deleteCatalogImage(imagePath) {
  if (!imagePath) return;

  if (!imagePath.startsWith("/uploads/catalog/")) return;

  const fullPath = path.join(
    __dirname,
    "..",
    "public",
    imagePath.replace(/^\//, "")
  );

  fs.unlink(fullPath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete:", fullPath);
    }
  });
}
module.exports = router;
