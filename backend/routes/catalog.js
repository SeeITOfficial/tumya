const express = require("express");
const router = express.Router();
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { requireAuth, requireAdmin } = require("../lib/auth");
const ALLOWED_STOCK_STATUS = ["in_stock", "out_of_stock", "coming_soon"];
const { upload, saveImage } = require("../lib/upload");
const { generateTrackingCode } = require("../lib/trackingCode");
// Public: list catalog items
router.get("/", (req, res) => {
  const items = db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all();
  res.json(items);
});

// Public: get market mode
router.get("/market_mode", (req, res) => {
  const setting = db.prepare("SELECT value FROM global_settings WHERE key = 'market_mode'").get();
  res.json({ market_mode: setting?.value === 'true' });
});

// Admin: toggle market mode
router.post("/market_mode", requireAuth, requireAdmin, async (req, res) => {
  const { market_mode } = req.body;
  db.prepare(`
    INSERT INTO global_settings (key, value) VALUES ('market_mode', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(market_mode ? 'true' : 'false');
  
  if (market_mode) {
    const { notifyCustomer } = require("../lib/push");
    const users = db.prepare("SELECT DISTINCT customer_id FROM push_subscriptions").all();
    for (const u of users) {
      notifyCustomer(u.customer_id, {
        title: "🛒 Market Mode Active!",
        body: "We are currently sourcing items! You can now book out-of-stock items in the catalog.",
        url: "/"
      }).catch(err => console.error(err));
    }
  }

  res.json({ success: true, market_mode });
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


// Customer: create bookings (now acts as an order)
router.post("/bookings", requireAuth, (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No booking items supplied." });
  }

  let catalogRows;
  try {
    catalogRows = items.map((i) => {
      const item = db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(i.catalog_item_id);
      if (!item) throw new Error(`Catalog item ${i.catalog_item_id} not found`);
      return { item, qty: i.qty };
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const total = catalogRows.reduce((sum, r) => sum + r.item.price * r.qty, 0);
  const trackingCode = generateTrackingCode();

  try {
    const orderId = db.transaction(() => {
      const orderResult = db
        .prepare(`INSERT INTO orders (customer_id, type, status, total_amount, tracking_code) VALUES (?, 'catalog', 'booking', ?, ?)`)
        .run(req.user.id, total, trackingCode);
      const newOrderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(`INSERT INTO order_items (order_id, catalog_item_id, qty, unit_price) VALUES (?, ?, ?, ?)`);
      for (const r of catalogRows) insertItem.run(newOrderId, r.item.id, r.qty, r.item.price);

      db.prepare(`INSERT INTO status_history (order_id, status, note) VALUES (?, 'booking', 'Booking Created')`).run(newOrderId);

      return newOrderId;
    })();

    res.status(201).json({ success: true, tracking_code: trackingCode, order_id: orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create booking." });
  }
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

// Admin: confirm booking and convert to order
router.post("/bookings/:id/confirm", requireAuth, requireAdmin, (req, res) => {
  const orderId = req.params.id;
  const { notifyCustomer } = require("../lib/push");

  try {
    const result = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found");
      if (order.status !== "booking") throw new Error("Order is not a booking");

      db.prepare("UPDATE orders SET status = 'pending', payment_mode = 'cod_cash' WHERE id = ?").run(orderId);
      db.prepare(`INSERT INTO status_history (order_id, status, note) VALUES (?, 'pending', 'Booking Confirmed')`).run(orderId);
      db.prepare(`INSERT INTO payments (order_id, method, amount, status) VALUES (?, 'cod', ?, 'pending')`).run(orderId, order.total_amount);

      return { customerId: order.customer_id, trackingCode: order.tracking_code };
    })();

    notifyCustomer(result.customerId, {
      title: "✅ Booking Confirmed!",
      body: `Your booking (${result.trackingCode}) is now an order. Please check your account.`,
      url: "/account"
    }).catch(err => console.error(err));

    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
