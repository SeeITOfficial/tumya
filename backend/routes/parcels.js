const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { generateTrackingCode } = require('../lib/trackingCode');
const { updateStatus } = require('../lib/orderLifecycle');
const { createParcelPayment, buildUpiLink, momoNumbers, submitReference, verifyPayment } = require('../lib/payments');

function validateHandler(prefix, body) {
  const type = body[`${prefix}_handler_type`];
  if (!['self_pickup', 'own_agent', 'you_deliver'].includes(type)) {
    throw new Error(`${prefix}_handler_type must be self_pickup, own_agent, or you_deliver`);
  }
  if (type === 'self_pickup' && !body[`${prefix}_point_id`]) {
    throw new Error(`${prefix}_point_id required when handler_type is self_pickup`);
  }
  if (type === 'own_agent' && (!body[`${prefix}_agent_name`] || !body[`${prefix}_agent_phone`])) {
    throw new Error(`${prefix}_agent_name and ${prefix}_agent_phone required when handler_type is own_agent`);
  }
  if (type === 'you_deliver' && !body[`${prefix}_address`]) {
    throw new Error(`${prefix}_address required when handler_type is you_deliver`);
  }
}

// Customer: submit a parcel (send or receive)
router.post('/', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.direction || !['india_to_uganda', 'uganda_to_india'].includes(b.direction)) {
    return res.status(400).json({ error: 'direction must be india_to_uganda or uganda_to_india' });
  }
  if (!b.send_or_receive || !['send', 'receive'].includes(b.send_or_receive)) {
    return res.status(400).json({ error: 'send_or_receive must be send or receive' });
  }
  if (!b.description) return res.status(400).json({ error: 'description required' });

  try {
    validateHandler('pickup', b);
    validateHandler('drop', b);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const trackingCode = generateTrackingCode();

  const tx = db.transaction(() => {
    const orderResult = db
      .prepare(
        `INSERT INTO orders (customer_id, type, status, tracking_code) VALUES (?, 'parcel', 'pending_quote', ?)`
      )
      .run(req.user.id, trackingCode);
    const orderId = orderResult.lastInsertRowid;

    db.prepare(
      `INSERT INTO parcels (
        order_id, direction, send_or_receive, description, photo_url,
        pickup_handler_type, pickup_point_id, pickup_agent_name, pickup_agent_phone, pickup_address,
        drop_handler_type, drop_point_id, drop_agent_name, drop_agent_phone, drop_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId, b.direction, b.send_or_receive, b.description, b.photo_url || null,
      b.pickup_handler_type, b.pickup_point_id || null, b.pickup_agent_name || null, b.pickup_agent_phone || null, b.pickup_address || null,
      b.drop_handler_type, b.drop_point_id || null, b.drop_agent_name || null, b.drop_agent_phone || null, b.drop_address || null
    );

    db.prepare(
      `INSERT INTO status_history (order_id, status, note) VALUES (?, 'pending_quote', 'Parcel submitted, awaiting admin quote')`
    ).run(orderId);

    return orderId;
  });

  const orderId = tx();
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
  const parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(orderId);
  res.status(201).json({ order, parcel });
});

// Admin: enter weight, get suggested price
router.post('/:orderId/weigh', requireAuth, requireAdmin, (req, res) => {
  const { weight_kg } = req.body;
  if (!weight_kg || weight_kg <= 0) return res.status(400).json({ error: 'weight_kg must be a positive number' });

  const parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(req.params.orderId);
  if (!parcel) return res.status(404).json({ error: 'Parcel not found' });

  const rate = db.prepare(`SELECT * FROM rate_config WHERE direction = ?`).get(parcel.direction);
  const suggested = rate ? Math.round(weight_kg * rate.rate_per_kg * 100) / 100 : null;

  db.prepare(`UPDATE parcels SET weight_kg = ?, suggested_amount = ? WHERE order_id = ?`).run(
    weight_kg, suggested, req.params.orderId
  );

  res.json({ weight_kg, suggested_amount: suggested, currency: rate ? rate.currency : null, rate_per_kg: rate ? rate.rate_per_kg : null });
});

// Admin: confirm the quote (accept suggested or override), moves status to 'quoted'
router.post('/:orderId/quote', requireAuth, requireAdmin, async (req, res) => {
  const { quote_amount } = req.body;
  if (!quote_amount || quote_amount <= 0) return res.status(400).json({ error: 'quote_amount must be a positive number' });

  const parcel = db.prepare(`SELECT * FROM parcels WHERE order_id = ?`).get(req.params.orderId);
  if (!parcel) return res.status(404).json({ error: 'Parcel not found' });
  if (!parcel.weight_kg) return res.status(400).json({ error: 'Parcel must be weighed before quoting' });

  db.prepare(
    `UPDATE parcels SET quote_amount = ?, quoted_at = datetime('now'), quoted_by = ? WHERE order_id = ?`
  ).run(quote_amount, req.user.id, req.params.orderId);
  db.prepare(`UPDATE orders SET total_amount = ? WHERE id = ?`).run(quote_amount, req.params.orderId);

  try {
    const order = await updateStatus(req.params.orderId, 'quoted', {
      note: `Quoted at ${quote_amount}`,
      changedBy: req.user.id,
    });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Customer: choose payment method for a quoted parcel (upi or momo), get payment instructions
router.post('/:orderId/payment/method', requireAuth, async (req, res) => {
  const { method } = req.body;
  if (!['upi', 'momo'].includes(method)) return res.status(400).json({ error: 'method must be upi or momo' });

  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND customer_id = ?`).get(req.params.orderId, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'quoted') return res.status(400).json({ error: 'Order must be in quoted status' });

  createParcelPayment(order.id, order.total_amount, method);
  await updateStatus(order.id, 'payment_pending', { note: `Customer selected ${method}`, changedBy: null });

  if (method === 'upi') {
    res.json({ method, upi_link: buildUpiLink(order.total_amount, order.tracking_code), amount: order.total_amount });
  } else {
    res.json({ method, momo_numbers: momoNumbers(), amount: order.total_amount });
  }
});

// Customer: submit the transaction reference after paying
router.post('/:orderId/payment/reference', requireAuth, (req, res) => {
  const { reference_number } = req.body;
  if (!reference_number) return res.status(400).json({ error: 'reference_number required' });

  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND customer_id = ?`).get(req.params.orderId, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const payment = submitReference(order.id, reference_number);
    res.json(payment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: verify the parcel payment after checking the bank/momo account, moves status to confirmed
router.post('/:orderId/payment/confirm', requireAuth, requireAdmin, async (req, res) => {
  try {
    const payment = verifyPayment(req.params.orderId, req.user.id);
    const order = await updateStatus(req.params.orderId, 'confirmed', {
      note: 'Payment verified by admin',
      changedBy: req.user.id,
    });
    res.json({ order, payment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: view/edit the per-kg rate defaults
router.get('/rates', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT * FROM rate_config`).all());
});

router.patch('/rates/:direction', requireAuth, requireAdmin, (req, res) => {
  const { rate_per_kg } = req.body;
  if (!rate_per_kg || rate_per_kg <= 0) return res.status(400).json({ error: 'rate_per_kg must be a positive number' });

  const result = db
    .prepare(`UPDATE rate_config SET rate_per_kg = ?, updated_at = datetime('now') WHERE direction = ?`)
    .run(rate_per_kg, req.params.direction);
  if (result.changes === 0) return res.status(404).json({ error: 'Unknown direction' });
  res.json(db.prepare(`SELECT * FROM rate_config WHERE direction = ?`).get(req.params.direction));
});

module.exports = router;
