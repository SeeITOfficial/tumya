const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { generateTrackingCode } = require('../lib/trackingCode');
const { updateStatus } = require('../lib/orderLifecycle');
const { createCatalogPayment, buildUpiLink, markCodCashPaid, verifyPayment, submitReference } = require('../lib/payments');

// Customer: place a catalog order
router.post('/catalog', requireAuth, (req, res) => {
  const { items, payment_mode } = req.body; // items: [{ catalog_item_id, qty }]
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
  if (!['cod_cash', 'cod_upi_scan'].includes(payment_mode)) {
    return res.status(400).json({ error: 'payment_mode must be cod_cash or cod_upi_scan' });
  }

  let catalogRows;
  try {
    catalogRows = items.map((i) => {
      const item = db.prepare(`SELECT * FROM catalog_items WHERE id = ?`).get(i.catalog_item_id);
      if (!item) throw new Error(`Catalog item ${i.catalog_item_id} not found`);
      if (item.stock_status !== 'in_stock') throw new Error(`${item.name} is out of stock`);
      if (!i.qty || i.qty <= 0) throw new Error(`Invalid quantity for ${item.name}`);
      return { item, qty: i.qty };
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const total = catalogRows.reduce((sum, r) => sum + r.item.price * r.qty, 0);
  const trackingCode = generateTrackingCode();

  let orderId;
  try {
    const tx = db.transaction(() => {
      const orderResult = db
        .prepare(
          `INSERT INTO orders (customer_id, type, status, payment_mode, total_amount, tracking_code)
           VALUES (?, 'catalog', 'confirmed', ?, ?, ?)`
        )
        .run(req.user.id, payment_mode, total, trackingCode);
      const newOrderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, catalog_item_id, qty, unit_price) VALUES (?, ?, ?, ?)`
      );
      for (const r of catalogRows) insertItem.run(newOrderId, r.item.id, r.qty, r.item.price);

      db.prepare(`INSERT INTO status_history (order_id, status, note) VALUES (?, 'confirmed', 'Order placed')`).run(newOrderId);

      createCatalogPayment(newOrderId, total, payment_mode);

      return newOrderId;
    });
    orderId = tx();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create order', detail: err.message });
  }

  res.status(201).json(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId));
});

// Anyone with the code: track an order (includes detail for Order Details screen)
router.get('/track/:trackingCode', (req, res) => {
  const order = db.prepare(`SELECT * FROM orders WHERE tracking_code = ?`).get(req.params.trackingCode);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const history = db
    .prepare(`SELECT status, note, timestamp FROM status_history WHERE order_id = ? ORDER BY timestamp`)
    .all(order.id);

  const detail = { order, history };
  if (order.type === 'catalog') {
    detail.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id);
  } else {
    detail.parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(order.id);
  }
  detail.payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(order.id);

  res.json(detail);
});

// Customer: list own orders
router.get('/mine', requireAuth, (req, res) => {
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
});

// Admin: list all orders, optional ?status= filter
router.get('/', requireAuth, requireAdmin, (req, res) => {
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
});

// Admin: get single order with full detail (items/parcel, payment, history)
router.get('/:id', requireAuth, requireAdmin, (req, res) => {
  const order = db
    .prepare(
      `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone
       FROM orders o JOIN users u ON u.id = o.customer_id WHERE o.id = ?`
    )
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const detail = { order };
  if (order.type === 'catalog') {
    detail.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id);
  } else {
    detail.parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(order.id);
  }
  detail.payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(order.id);
  detail.history = db.prepare(`SELECT * FROM status_history WHERE order_id = ? ORDER BY timestamp`).all(order.id);
  res.json(detail);
});

// Admin: claim/reassign who's handling this order
router.patch('/:id/assign', requireAuth, requireAdmin, (req, res) => {
  const { admin_id } = req.body;
  const result = db.prepare(`UPDATE orders SET handled_by_admin_id = ? WHERE id = ?`).run(admin_id || req.user.id, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
  res.json(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id));
});

// Admin: advance status (e.g. in_transit, out_for_delivery, delivered)
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { status, note } = req.body;
  try {
    const order = await updateStatus(req.params.id, status, { note, changedBy: req.user.id });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin, at handoff: reveal the UPI QR for a cod_upi_scan order
router.get('/:id/reveal-qr', requireAuth, requireAdmin, (req, res) => {
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.payment_mode !== 'cod_upi_scan') return res.status(400).json({ error: 'This order is not cod_upi_scan' });

  const link = buildUpiLink(order.total_amount, order.tracking_code);
  res.json({ upi_link: link, amount: order.total_amount });
});

// Admin, at handoff: mark a cod payment as paid (cash confirmed in person, or scan reference entered)
router.post('/:id/payment/confirm', requireAuth, requireAdmin, (req, res) => {
  const { reference_number } = req.body;
  try {
    if (reference_number) submitReference(req.params.id, reference_number);
    const payment = verifyPayment(req.params.id, req.user.id);
    res.json(payment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
