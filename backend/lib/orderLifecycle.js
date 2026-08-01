const db = require("../db");
const { notifyCustomer } = require("./push");
const {
  sendOrderConfirmed,
  sendOutForDelivery,
  sendOrderDelivered,
} = require("./email");

const CATALOG_STATUSES = [
  "pending",
  "confirmed",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const PARCEL_STATUSES = [
  "pending_quote",
  "quoted",
  "payment_pending",
  "confirmed",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ready_for_pickup",
  "cancelled",
];

const STATUS_LABELS = {
  pending: "Awaiting confirmation",
  pending_quote: "Waiting for quote",
  quoted: "Quote ready",
  payment_pending: "Waiting for payment confirmation",
  confirmed: "Confirmed",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ready_for_pickup: "Ready for pickup",
  cancelled: "Cancelled",
};

const NEXT_ACTION = {
  pending: {
    nextStatus: "confirmed",
    button: "Confirm Order",
  },

  confirmed: {
    nextStatus: "out_for_delivery",
    button: "Start Delivery",
  },

  out_for_delivery: {
    nextStatus: "delivered",
    button: "Mark Delivered",
  },

  delivered: null,
};

function validStatusesFor(orderType) {
  return orderType === "catalog"
    ? CATALOG_STATUSES
    : PARCEL_STATUSES;
}

async function updateStatus(
  orderId,
  newStatus,
  { note, changedBy } = {}
) {
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  const valid = validStatusesFor(order.type);

  if (!valid.includes(newStatus)) {
    throw new Error(
      `"${newStatus}" is not a valid status for a ${order.type} order`
    );
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE orders
      SET status = ?, 
          updated_at = datetime('now'),
          handled_by_admin_id = COALESCE(handled_by_admin_id, ?)
      WHERE id = ?
    `).run(newStatus, changedBy || null, orderId);

    db.prepare(`
      INSERT INTO status_history
      (order_id, status, note, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(
      orderId,
      newStatus,
      note || null,
      changedBy || null
    );
  });

  tx();

  await notifyCustomer(order.customer_id, {
    title: "Tumya order update",
    body: `${order.tracking_code}: ${
      STATUS_LABELS[newStatus] || newStatus
    }`,
    trackingCode: order.tracking_code,
    status: newStatus,
  });

  const updatedOrder = db
    .prepare(`
      SELECT
        o.*,
        u.email,
        u.name AS customerName
      FROM orders o
      JOIN users u
        ON u.id = o.customer_id
      WHERE o.id = ?
    `)
    .get(orderId);

  switch (newStatus) {
    case "confirmed":
      await sendOrderConfirmed({
        email: updatedOrder.email,
        customerName: updatedOrder.customerName,
        orderNumber: updatedOrder.tracking_code,
      });
      break;

    case "out_for_delivery":
      await sendOutForDelivery({
        email: updatedOrder.email,
        customerName: updatedOrder.customerName,
        orderNumber: updatedOrder.tracking_code,
      });
      break;

    case "delivered": {
      const items = db.prepare(`
        SELECT oi.qty, oi.unit_price, ci.name
        FROM order_items oi
        LEFT JOIN catalog_items ci ON ci.id = oi.catalog_item_id
        WHERE oi.order_id = ?
      `).all(orderId);
      const payment = db.prepare(`SELECT * FROM payments WHERE order_id = ?`).get(orderId);
      await sendOrderDelivered({
        email: updatedOrder.email,
        customerName: updatedOrder.customerName,
        orderNumber: updatedOrder.tracking_code,
        totalAmount: updatedOrder.total_amount,
        items,
        payment,
      });
      break;
    }
  }

  return updatedOrder;
}

module.exports = {
  updateStatus,
  validStatusesFor,
  STATUS_LABELS,
  NEXT_ACTION,
};