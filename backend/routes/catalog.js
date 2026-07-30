const express = require("express");
const router = express.Router();
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { requireAuth, requireAdmin } = require("../lib/auth");
const ALLOWED_STOCK_STATUS = ["in_stock", "out_of_stock", "coming_soon"];
const { upload, saveImage } = require("../lib/upload");
const { generateTrackingCode } = require("../lib/trackingCode");
const { createCatalogPayment } = require("../lib/payments");

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Returns true when val is a finite number >= 0. */
const isNonNegativeFinite = (val) => {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0;
};
/** Returns true when val coerces to a positive safe integer. */
const isPositiveInteger = (val) =>
  Number.isInteger(Number(val)) && Number(val) > 0;

/** Returns true when val is a non-empty string after trimming. */
const isNonEmptyString = (val) =>
  typeof val === "string" && val.trim().length > 0;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /
 * Public: list all catalog items ordered by name.
 */
router.get("/", (req, res) => {
  const items = db.prepare(`SELECT * FROM catalog_items ORDER BY name`).all();
  res.json(items);
});

/**
 * GET /market_mode
 * Public: return whether market mode is currently enabled.
 */
router.get("/market_mode", (req, res) => {
  const setting = db
    .prepare("SELECT value FROM global_settings WHERE key = 'market_mode'")
    .get();
  res.json({ market_mode: setting?.value === "true" });
});

/**
 * POST /market_mode
 * Admin: toggle market mode on or off and notify subscribed customers when enabled.
 */
router.post("/market_mode", requireAuth, requireAdmin, async (req, res) => {
  const { market_mode } = req.body;

  try {
    db.prepare(`
      INSERT INTO global_settings (key, value) VALUES ('market_mode', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(market_mode ? "true" : "false");
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update market mode." });
  }

  if (market_mode) {
    const { notifyCustomer } = require("../lib/push");
    const users = db
      .prepare("SELECT DISTINCT customer_id FROM push_subscriptions")
      .all();
    for (const u of users) {
      notifyCustomer(u.customer_id, {
        title: "🛒 Market Mode Active!",
        body: "We are currently sourcing items! You can now book out-of-stock items in the catalog.",
        url: "/",
      }).catch((err) => console.error(err));
    }
  }

  res.json({ success: true, market_mode });
});

/**
 * POST /
 * Admin: create a new catalog item. Accepts optional photo and photo2 uploads.
 */
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
      const { name, unit, stock_status } = req.body;
      const price = req.body.price !== undefined ? Number(req.body.price) : undefined;

      if (!isNonEmptyString(name)) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      if (!isNonEmptyString(unit)) {
        return res.status(400).json({ error: "unit must be a non-empty string" });
      }
      if (price === undefined || price === null || !isNonNegativeFinite(price)) {
        return res.status(400).json({ error: "price must be a finite number >= 0" });
      }
      if (stock_status && !ALLOWED_STOCK_STATUS.includes(stock_status)) {
        return res.status(400).json({
          error: "stock_status must be one of in_stock, out_of_stock, coming_soon",
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

      let result;
      try {
        result = db
          .prepare(`
            INSERT INTO catalog_items
            (name, unit, price, stock_status, photo_url, photo_url_2)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            name.trim(),
            unit.trim(),
            price,
            stock_status || "in_stock",
            photo_url,
            photo_url_2
          );
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to create item." });
      }

      res.status(201).json(
        db.prepare("SELECT * FROM catalog_items WHERE id=?").get(result.lastInsertRowid)
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save image." });
    }
  }
);

/**
 * PATCH /:id
 * Admin: update a catalog item's fields and/or photos. All fields are optional.
 */
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
      if (!isPositiveInteger(req.params.id)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const item = db
        .prepare("SELECT * FROM catalog_items WHERE id = ?")
        .get(req.params.id);

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const { name, unit, stock_status } = req.body;
      const price = req.body.price !== undefined ? Number(req.body.price) : undefined;

      if (name !== undefined && !isNonEmptyString(name)) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      if (unit !== undefined && !isNonEmptyString(unit)) {
        return res.status(400).json({ error: "unit must be a non-empty string" });
      }
      if (price !== undefined && !isNonNegativeFinite(price)) {
        return res.status(400).json({ error: "price must be a finite number >= 0" });
      }
      if (stock_status && !ALLOWED_STOCK_STATUS.includes(stock_status)) {
        return res.status(400).json({
          error: "stock_status must be one of in_stock, out_of_stock, coming_soon",
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

      try {
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
          name !== undefined ? name.trim() : item.name,
          unit !== undefined ? unit.trim() : item.unit,
          price !== undefined ? price : item.price,
          stock_status ?? item.stock_status,
          photo_url,
          photo_url_2,
          req.params.id
        );
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to update item." });
      }

      res.json(
        db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(req.params.id)
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update item." });
    }
  }
);

/**
 * DELETE /:id
 * Admin: delete a catalog item and its associated images.
 */
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ error: "Invalid item ID" });
  }

  const item = db
    .prepare("SELECT * FROM catalog_items WHERE id=?")
    .get(req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found" });

  deleteCatalogImage(item.photo_url);
  deleteCatalogImage(item.photo_url_2);

  let result;
  try {
    result = db
      .prepare(`DELETE FROM catalog_items WHERE id = ?`)
      .run(req.params.id);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete item." });
  }

  if (result.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

/**
 * POST /bookings
 * Customer: create a booking order for one or more catalog items.
 * Rejects duplicate catalog_item_id values and invalid qty fields.
 */
router.post("/bookings", requireAuth, (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No booking items supplied." });
  }

  let catalogRows;
  try {
    const seenIds = new Set();
    catalogRows = items.map((i) => {
      if (!isPositiveInteger(i.catalog_item_id)) {
        throw new Error(`Invalid catalog_item_id: ${i.catalog_item_id}`);
      }
      if (!Number.isInteger(i.qty) || i.qty <= 0) {
        throw new Error(`qty must be a positive integer for item ${i.catalog_item_id}`);
      }
      if (seenIds.has(i.catalog_item_id)) {
        throw new Error(`Duplicate catalog_item_id: ${i.catalog_item_id}`);
      }
      seenIds.add(i.catalog_item_id);

      const item = db
        .prepare(`SELECT * FROM catalog_items WHERE id = ?`)
        .get(i.catalog_item_id);
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
        .prepare(
          `INSERT INTO orders (customer_id, type, status, total_amount, tracking_code) VALUES (?, 'catalog', 'booking', ?, ?)`
        )
        .run(req.user.id, total, trackingCode);
      const newOrderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, catalog_item_id, qty, unit_price) VALUES (?, ?, ?, ?)`
      );
      for (const r of catalogRows) insertItem.run(newOrderId, r.item.id, r.qty, r.item.price);

      db.prepare(
        `INSERT INTO status_history (order_id, status, note) VALUES (?, 'booking', 'Booking Created')`
      ).run(newOrderId);

      return newOrderId;
    })();

    res.status(201).json({ success: true, tracking_code: trackingCode, order_id: orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create booking." });
  }
});

/**
 * Helper: delete a catalog image file from disk if it is a managed upload path.
 */
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

/**
 * POST /bookings/:id/confirm
 * Admin: confirm a booking, converting it to a pending order and creating a
 * payment record via the payments helper. Notifies the customer via push.
 */
router.post("/bookings/:id/confirm", requireAuth, requireAdmin, (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ error: "Invalid booking ID" });
  }

  const orderId = req.params.id;
  const { notifyCustomer } = require("../lib/push");

  let result;
  try {
    result = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found");
      if (order.status !== "booking") throw new Error("Order is not a booking");

      db.prepare(
        "UPDATE orders SET status = 'pending', payment_mode = 'cod_cash' WHERE id = ?"
      ).run(orderId);
      db.prepare(
        `INSERT INTO status_history (order_id, status, note) VALUES (?, 'pending', 'Booking Confirmed')`
      ).run(orderId);

      // Use the payments helper to avoid bypassing the duplicate-payment guard
      createCatalogPayment(orderId, order.total_amount, "cod_cash");

      return { customerId: order.customer_id, trackingCode: order.tracking_code };
    })();
  } catch (err) {
    console.error(err);
    const isBusinessError =
      err.message === "Order not found" ||
      err.message === "Order is not a booking" ||
      err.message === "Payment record already exists.";
    return res.status(isBusinessError ? 400 : 500).json({ error: err.message });
  }

  notifyCustomer(result.customerId, {
    title: "✅ Booking Confirmed!",
    body: `Your booking (${result.trackingCode}) is now an order. Please check your account.`,
    url: "/account",
  }).catch((err) => console.error(err));

  res.json({ success: true, order_id: orderId });
});

module.exports = router;
