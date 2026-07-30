const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { generateTrackingCode } = require('../lib/trackingCode');
const { updateStatus } = require('../lib/orderLifecycle');
const {
  createCatalogPayment,
  buildUpiLink,
  verifyPayment,
  submitReference,
} = require("../lib/payments");

// Helpers
const isPositiveInteger = (val) => Number.isInteger(Number(val)) && Number(val) > 0;
const isFiniteNumber = (val) => Number.isFinite(Number(val));
/**
 * Customer: place a catalog order
 */
router.post('/catalog', requireAuth, (req, res) => {
  try {
    let { items, payment_mode, delivery_lat, delivery_lng, delivery_address_text } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
    if (!['cod_cash', 'cod_upi_scan'].includes(payment_mode)) {
      return res.status(400).json({ error: 'payment_mode must be cod_cash or cod_upi_scan' });
    }
    if (delivery_lat == null && delivery_lng == null && !delivery_address_text) {
      return res.status(400).json({ error: 'delivery location required' });
    }

    if (delivery_lat != null && !isFiniteNumber(delivery_lat)) return res.status(400).json({ error: 'Invalid delivery_lat' });
    if (delivery_lng != null && !isFiniteNumber(delivery_lng)) return res.status(400).json({ error: 'Invalid delivery_lng' });

    let catalogRows;
    const seenItemIds = new Set();
    
    catalogRows = items.map((i) => {
      if (!isPositiveInteger(i.catalog_item_id)) throw new Error(`Invalid catalog_item_id: ${i.catalog_item_id}`);
      if (!Number.isInteger(i.qty) || i.qty <= 0) throw new Error(`Invalid qty for item ${i.catalog_item_id}`);
      
      if (seenItemIds.has(i.catalog_item_id)) {
        throw new Error(`Duplicate catalog_item_id: ${i.catalog_item_id}`);
      }
      seenItemIds.add(i.catalog_item_id);

      const item = db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(i.catalog_item_id);
      if (!item) throw new Error(`Catalog item ${i.catalog_item_id} not found`);
      if (item.stock_status !== 'in_stock') throw new Error(`${item.name} is out of stock`);
      return { item, qty: i.qty };
    });

    const total = catalogRows.reduce((sum, r) => sum + r.item.price * r.qty, 0);
    const trackingCode = generateTrackingCode();

    const tx = db.transaction(() => {
      const orderResult = db
        .prepare(
          `INSERT INTO orders (customer_id, type, status, payment_mode, total_amount, tracking_code, delivery_lat, delivery_lng, delivery_address_text) VALUES (?, 'catalog', 'pending', ?, ?, ?, ?, ?, ?)`
        )
        .run(req.user.id, payment_mode, total, trackingCode, delivery_lat ?? null, delivery_lng ?? null, delivery_address_text || null);
      const newOrderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, catalog_item_id, qty, unit_price) VALUES (?, ?, ?, ?)`
      );
      for (const r of catalogRows) insertItem.run(newOrderId, r.item.id, r.qty, r.item.price);

      db.prepare(`INSERT INTO status_history (order_id, status, note) VALUES (?, 'pending', 'Order Received')`).run(newOrderId);

      createCatalogPayment(newOrderId, total, payment_mode);

      return newOrderId;
    });
    
    let orderId;
    try {
      orderId = tx();
    } catch (dbErr) {
      return res.status(500).json({ error: 'Failed to create order' });
    }
    res.status(201).json(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId));
  } catch (err) {
    // Validation / stock / duplicate errors thrown in the items map are user errors (400).
    const isUserError = ['not found', 'Invalid', 'Duplicate', 'out of stock'].some((s) => err.message.includes(s));
    res.status(isUserError ? 400 : 500).json({ error: 'Failed to create order', detail: err.message });
  }
});

/**
 * Anyone with the code: track an order (includes detail for Order Details screen)
 */
router.get('/track/:trackingCode', (req, res) => {
  try {
    let trackingCode = req.params.trackingCode;
    if (typeof trackingCode !== 'string' || !trackingCode.trim()) return res.status(400).json({ error: 'Invalid tracking code' });
    trackingCode = trackingCode.trim();

    const order = db.prepare(`SELECT * FROM orders WHERE tracking_code = ?`).get(trackingCode);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const history = db
      .prepare(`SELECT status, note, timestamp FROM status_history WHERE order_id = ? ORDER BY timestamp`)
      .all(order.id);

    const detail = { order, history };
    if (order.type === 'catalog') {
      detail.items = db.prepare(`
        SELECT oi.*, ci.name AS item_name
        FROM order_items oi
        LEFT JOIN catalog_items ci ON oi.catalog_item_id = ci.id
        WHERE oi.order_id = ?
      `).all(order.id);
    } else {
      detail.parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(order.id);
    }
    detail.payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(order.id);

    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Customer: list own orders
 */
router.get('/mine', requireAuth, (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT o.*,
        (
          SELECT sh.note
          FROM status_history sh
          WHERE sh.order_id = o.id
          ORDER BY sh.timestamp DESC
          LIMIT 1
        ) AS latest_note
      FROM orders o
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `).all(req.user.id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Admin: list all orders, optional ?status= filter
 */
router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const { status } = req.query;
    const base = `
      SELECT o.*, u.name AS customer_name, u.phone AS customer_phone,
            a.name AS handled_by_name
      FROM orders o
      JOIN users u ON u.id = o.customer_id
      LEFT JOIN users a ON a.id = o.handled_by_admin_id
    `;
    const orders = status
      ? db.prepare(`${base} WHERE o.status = ? ORDER BY o.created_at DESC`).all(status)
      : db.prepare(`${base} ORDER BY o.created_at DESC`).all();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Admin: get single order with full detail (items/parcel, payment, history)
 */
router.get('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Invalid order ID' });

    const order = db
      .prepare(
        `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone
         FROM orders o JOIN users u ON u.id = o.customer_id WHERE o.id = ?`
      )
      .get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const detail = { order };
    if (order.type === 'catalog') {
      detail.items = db.prepare(`
      SELECT
          oi.catalog_item_id,
          oi.qty,
          oi.unit_price,

          ci.name,
          ci.unit,
          ci.price,
          ci.photo_url

      FROM order_items oi
      INNER JOIN catalog_items ci
          ON oi.catalog_item_id = ci.id

      WHERE oi.order_id = ?
      `).all(order.id);  }
    else {
      detail.parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(order.id);
    }
    detail.payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(order.id);
    detail.history = db.prepare(`SELECT * FROM status_history WHERE order_id = ? ORDER BY timestamp`).all(order.id);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Admin: claim/reassign who's handling this order
 */
router.patch('/:id/assign', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Invalid order ID' });

    const { admin_id } = req.body;
    if (admin_id !== undefined && admin_id !== null && !isPositiveInteger(admin_id)) {
      return res.status(400).json({ error: 'admin_id must be a positive integer' });
    }

    const finalAdminId = admin_id || req.user.id;
    const adminUser = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'admin'`).get(finalAdminId);
    if (!adminUser) return res.status(400).json({ error: 'Admin user not found' });

    const result = db.prepare(`UPDATE orders SET handled_by_admin_id = ? WHERE id = ?`).run(finalAdminId, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Admin: update order status
 */
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Invalid order ID' });

    let { status, note } = req.body;
    if (typeof status !== 'string' || !status.trim()) return res.status(400).json({ error: 'status must be a non-empty string' });
    if (note !== undefined && typeof note !== 'string') return res.status(400).json({ error: 'note must be a string' });

    const order = await updateStatus(req.params.id, status, { note, changedBy: req.user.id });
    res.json(order);
  } catch (err) {
    // updateStatus throws plain Error messages for business-rule violations; treat
    // anything that looks like a DB/system fault as a 500 to avoid masking it as 400.
    const isBusinessError = err.message && !err.message.toLowerCase().includes('sqlite');
    res.status(isBusinessError ? 400 : 500).json({ error: err.message });
  }
});

/**
 * Admin, at handoff: reveal the UPI QR for a cod_upi_scan order
 */
router.get('/:id/reveal-qr', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Invalid order ID' });

    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_mode !== 'cod_upi_scan') return res.status(400).json({ error: 'This order is not cod_upi_scan' });

    const payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(order.id);
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    const link = buildUpiLink(order.total_amount, order.tracking_code);
    res.json({ upi_link: link, amount: order.total_amount });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Admin, at handoff: mark a cod payment as paid (cash confirmed in person, or scan reference entered)
 */
router.post('/:id/payment/confirm', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Invalid order ID' });

    let { reference_number } = req.body;
    if (reference_number !== undefined) {
      if (typeof reference_number !== 'string' || !reference_number.trim()) {
        return res.status(400).json({ error: 'reference_number must be a non-empty string' });
      }
    }

    const payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    if (reference_number) submitReference(req.params.id, reference_number);
    const confirmedPayment = verifyPayment(req.params.id, req.user.id);
    res.json(confirmedPayment);
  } catch (err) {
    // Payment helpers throw plain Error messages for business-rule violations; DB
    // faults produce SQLite-style messages and should be surfaced as 500.
    const isBusinessError = err.message && !err.message.toLowerCase().includes('sqlite');
    res.status(isBusinessError ? 400 : 500).json({ error: err.message });
  }
});

/**
 * Customer: cancel their own order (only if delivery hasn't started)
 */
router.delete('/cancel/:trackingCode', requireAuth, (req, res) => {
  try {
    let trackingCode = req.params.trackingCode;
    if (typeof trackingCode !== 'string' || !trackingCode.trim()) return res.status(400).json({ error: 'Invalid tracking code' });
    trackingCode = trackingCode.trim();

    const order = db.prepare(`SELECT * FROM orders WHERE tracking_code = ?`).get(trackingCode);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Must belong to this customer
    if (order.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your order' });
    }
    
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    // Lock cancellation once delivery has started
    const nonCancellableStatuses =
      order.type === "catalog"
        ? ["out_for_delivery", "delivered"]
        : ["in_transit", "out_for_delivery", "delivered"];
    if (nonCancellableStatuses.includes(order.status)) {
      return res.status(403).json({ error: 'Cannot cancel — delivery has already started' });
    }

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM status_history WHERE order_id = ?`).run(order.id);
      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(order.id);
      db.prepare(`DELETE FROM parcels WHERE order_id = ?`).run(order.id);
      db.prepare(`DELETE FROM payments WHERE order_id = ?`).run(order.id);
      db.prepare(`DELETE FROM orders WHERE id = ?`).run(order.id);
    });
    tx();
    res.json({ success: true, cancelled: order.tracking_code });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order', detail: err.message });
  }
});

module.exports = router;