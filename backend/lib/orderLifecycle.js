const db = require('../db');
const { notifyCustomer } = require('./push');

const CATALOG_STATUSES = ['confirmed', 'in_transit', 'out_for_delivery', 'delivered'];
const PARCEL_STATUSES = [
  'pending_quote',
  'quoted',
  'payment_pending',
  'confirmed',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'ready_for_pickup',
];

const STATUS_LABELS = {
  pending_quote: 'Waiting for quote',
  quoted: 'Quote ready',
  payment_pending: 'Waiting for payment confirmation',
  confirmed: 'Confirmed',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  ready_for_pickup: 'Ready for pickup',
};

function validStatusesFor(orderType) {
  return orderType === 'catalog' ? CATALOG_STATUSES : PARCEL_STATUSES;
}

/** Moves an order to a new status, logs history, notifies the customer. Throws on invalid transition target. */
async function updateStatus(orderId, newStatus, { note, changedBy } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Order not found');

  const valid = validStatusesFor(order.type);
  if (!valid.includes(newStatus)) {
    throw new Error(`"${newStatus}" is not a valid status for a ${order.type} order`);
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, orderId);
    db.prepare(
      `INSERT INTO status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)`
    ).run(orderId, newStatus, note || null, changedBy || null);
  });
  tx();

  await notifyCustomer(order.customer_id, {
    title: 'Tumya order update',
    body: `${order.tracking_code}: ${STATUS_LABELS[newStatus] || newStatus}`,
    trackingCode: order.tracking_code,
    status: newStatus,
  });

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

module.exports = { updateStatus, validStatusesFor, STATUS_LABELS };
