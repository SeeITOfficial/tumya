const db = require("../db");
const { updateStatus } = require("./orderLifecycle");
const { notifyCustomer } = require("./push");
const { sendParcelQuote } = require("./email");

const QUOTE_LOCKED_STATUSES = [
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ready_for_pickup",
  "cancelled",
];

const USD_INR_FALLBACK = 83.5;

function isQuoteLocked(orderStatus) {
  return QUOTE_LOCKED_STATUSES.includes(orderStatus);
}

async function fetchUsdInrRate() {
  try {
    const response = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    const data = await response.json();
    if (data?.rates?.INR) {
      return data.rates.INR;
    }
  } catch (e) {
    console.error("Failed to fetch exchange rate", e);
  }
  return USD_INR_FALLBACK;
}

async function calculateSuggestedAmount(weightKg, direction) {
  const rate = db
    .prepare("SELECT * FROM rate_config WHERE direction=?")
    .get(direction);

  if (!rate) {
    return { suggested_amount: null, rate_per_kg: null, inr_rate_used: 1 };
  }

  const inrRate = await fetchUsdInrRate();
  const suggested =
    Math.round(weightKg * rate.rate_per_kg * inrRate * 100) / 100;

  return {
    suggested_amount: suggested,
    rate_per_kg: rate.rate_per_kg,
    inr_rate_used: inrRate,
  };
}

function resolveFinalQuote(suggestedAmount, customAmount) {
  const custom = customAmount != null ? Number(customAmount) : null;
  if (Number.isFinite(custom) && custom > 0) {
    return custom;
  }
  return suggestedAmount;
}

function syncPaymentAmount(orderId, quoteAmount) {
  const payment = db
    .prepare("SELECT * FROM payments WHERE order_id = ?")
    .get(orderId);

  if (payment && payment.status !== "verified") {
    db.prepare(`
      UPDATE payments
      SET amount = ?
      WHERE order_id = ?
    `).run(quoteAmount, orderId);
  }
}

async function applyParcelQuote(orderId, { weight_kg, custom_amount, adminId }) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.type !== "parcel") {
    throw new Error("Order is not a parcel");
  }
  if (isQuoteLocked(order.status)) {
    throw new Error("Quote is locked after shipment has started");
  }

  const parcel = db
    .prepare("SELECT * FROM parcels WHERE order_id = ?")
    .get(orderId);
  if (!parcel) {
    throw new Error("Parcel not found");
  }

  const { suggested_amount, rate_per_kg, inr_rate_used } =
    await calculateSuggestedAmount(weight_kg, parcel.direction);

  if (suggested_amount == null) {
    throw new Error("No rate configured for this parcel direction");
  }

  const finalQuote = resolveFinalQuote(suggested_amount, custom_amount);
  if (!Number.isFinite(finalQuote) || finalQuote <= 0) {
    throw new Error("Could not determine a valid quote amount");
  }

  const isManualOverride =
    custom_amount != null &&
    Number.isFinite(Number(custom_amount)) &&
    Number(custom_amount) > 0 &&
    Number(custom_amount) !== suggested_amount;

  const isFirstQuote = !parcel.quote_amount;

  db.prepare(`
    UPDATE parcels
    SET
      weight_kg = ?,
      suggested_amount = ?,
      quote_amount = ?,
      quoted_at = datetime('now'),
      quoted_by = ?
    WHERE order_id = ?
  `).run(weight_kg, suggested_amount, finalQuote, adminId, orderId);

  db.prepare(`
    UPDATE orders
    SET total_amount = ?
    WHERE id = ?
  `).run(finalQuote, orderId);

  syncPaymentAmount(orderId, finalQuote);

  const customer = db
    .prepare("SELECT email, name FROM users WHERE id = ?")
    .get(order.customer_id);

  if (order.status === "pending_quote") {
    await updateStatus(orderId, "quoted", {
      note: `Quoted at ₹${finalQuote}`,
      changedBy: adminId,
    });
  } else {
    db.prepare(`
      INSERT INTO status_history
      (order_id, status, note, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(
      orderId,
      order.status,
      `Quote updated to ₹${finalQuote}${isManualOverride ? " (manual override)" : ""}`,
      adminId
    );

    await notifyCustomer(order.customer_id, {
      title: "Tumya order update",
      body: `${order.tracking_code}: Quote updated — ₹${finalQuote}`,
      trackingCode: order.tracking_code,
      status: order.status,
    });
  }

  if (customer?.email) {
    sendParcelQuote({
      email: customer.email,
      customerName: customer.name || "Customer",
      orderNumber: order.tracking_code,
      quoteAmount: finalQuote,
      weightKg: weight_kg,
      isUpdate: !isFirstQuote,
    }).catch((err) => console.error("sendParcelQuote failed:", err));
  }

  const updatedOrder = db
    .prepare(`
      SELECT o.*, u.email, u.name AS customer_name
      FROM orders o
      JOIN users u ON u.id = o.customer_id
      WHERE o.id = ?
    `)
    .get(orderId);

  const updatedParcel = db
    .prepare("SELECT * FROM parcels WHERE order_id = ?")
    .get(orderId);

  return {
    order: updatedOrder,
    parcel: updatedParcel,
    weight_kg,
    suggested_amount,
    quote_amount: finalQuote,
    currency: "INR",
    rate_per_kg,
    inr_rate_used,
    is_first_quote: isFirstQuote,
  };
}

module.exports = {
  QUOTE_LOCKED_STATUSES,
  isQuoteLocked,
  calculateSuggestedAmount,
  resolveFinalQuote,
  applyParcelQuote,
};
