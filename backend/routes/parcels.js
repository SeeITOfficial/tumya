const express = require("express");
const router = express.Router();

const db = require("../db");

const { requireAuth, requireAdmin } = require("../lib/auth");
const { generateTrackingCode } = require("../lib/trackingCode");
const { updateStatus } = require("../lib/orderLifecycle");

const {
  createParcelPayment,
  buildUpiLink,
  momoNumbers,
  submitReference,
  verifyPayment,
} = require("../lib/payments");

// Reserved for future image upload support
// const { upload, saveImage } = require("../lib/upload");

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Returns true only when val is a finite number strictly greater than zero. */
const isPositiveFinite = (val) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0;
};
/** Returns true when val coerces to a positive safe integer (e.g. route param strings). */
const isPositiveInteger = (val) =>
  Number.isInteger(Number(val)) && Number(val) > 0;

/** Returns true when val is a non-empty string after trimming. */
const isNonEmptyString = (val) =>
  typeof val === "string" && val.trim().length > 0;

// ---------------------------------------------------------------------------
// Internal handler validator (unchanged logic, hardened field checks)
// ---------------------------------------------------------------------------

function validateHandler(prefix, body) {
  const type = body[`${prefix}_handler_type`];

  if (!["self_pickup", "own_agent", "you_deliver"].includes(type)) {
    throw new Error(
      `${prefix}_handler_type must be self_pickup, own_agent, or you_deliver`
    );
  }

  if (type === "self_pickup") {
    const pointId = body[`${prefix}_point_id`];
    if (!pointId) {
      throw new Error(
        `${prefix}_point_id required when handler_type is self_pickup`
      );
    }
    if (!isPositiveInteger(pointId)) {
      throw new Error(`${prefix}_point_id must be a positive integer`);
    }
  }

  if (type === "own_agent") {
    const name = body[`${prefix}_agent_name`];
    const phone = body[`${prefix}_agent_phone`];
    if (!name || !phone) {
      throw new Error(
        `${prefix}_agent_name and ${prefix}_agent_phone required when handler_type is own_agent`
      );
    }
    if (!isNonEmptyString(name)) {
      throw new Error(`${prefix}_agent_name must be a non-empty string`);
    }
    if (typeof phone !== "string") {
      throw new Error(`${prefix}_agent_phone must be a string`);
    }
  }

  if (type === "you_deliver") {
    const address = body[`${prefix}_address`];
    if (!address) {
      throw new Error(
        `${prefix}_address required when handler_type is you_deliver`
      );
    }
    if (!isNonEmptyString(address)) {
      throw new Error(`${prefix}_address must be a non-empty string`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                           CUSTOMER SUBMITS PARCEL                          */
/* -------------------------------------------------------------------------- */

/**
 * POST /
 * Customer submits a new parcel order. Validates direction, send_or_receive,
 * description, and both pickup/drop handler configurations before persisting.
 */
router.post("/", requireAuth, (req, res) => {
  const b = req.body;

  if (!["india_to_uganda", "uganda_to_india"].includes(b.direction)) {
    return res.status(400).json({
      error: "direction must be india_to_uganda or uganda_to_india",
    });
  }

  if (!["send", "receive"].includes(b.send_or_receive)) {
    return res.status(400).json({
      error: "send_or_receive must be send or receive",
    });
  }

  if (!isNonEmptyString(b.description)) {
    return res.status(400).json({ error: "description required" });
  }

  try {
    validateHandler("pickup", b);
    validateHandler("drop", b);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const trackingCode = generateTrackingCode();

  let orderId;
  try {
    orderId = db.transaction(() => {
      const order = db
        .prepare(`
          INSERT INTO orders
          (customer_id, type, status, tracking_code)
          VALUES (?, 'parcel', 'pending_quote', ?)
        `)
        .run(req.user.id, trackingCode);

      const id = order.lastInsertRowid;

      db.prepare(`
        INSERT INTO parcels (
          order_id,
          direction,
          send_or_receive,
          description,
          photo_url,

          pickup_handler_type,
          pickup_point_id,
          pickup_agent_name,
          pickup_agent_phone,
          pickup_address,

          drop_handler_type,
          drop_point_id,
          drop_agent_name,
          drop_agent_phone,
          drop_address
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        b.direction,
        b.send_or_receive,
        b.description.trim(),
        null,

        b.pickup_handler_type,
        b.pickup_point_id || null,
        b.pickup_agent_name ? b.pickup_agent_name.trim() : null,
        b.pickup_agent_phone || null,
        b.pickup_address ? b.pickup_address.trim() : null,

        b.drop_handler_type,
        b.drop_point_id || null,
        b.drop_agent_name ? b.drop_agent_name.trim() : null,
        b.drop_agent_phone || null,
        b.drop_address ? b.drop_address.trim() : null
      );

      db.prepare(`
        INSERT INTO status_history
        (order_id, status, note)
        VALUES (?, 'pending_quote', 'Parcel submitted, awaiting admin quote')
      `).run(id);

      return id;
    })();
  } catch (err) {
    return res.status(500).json({ error: "Failed to create parcel order" });
  }

  res.status(201).json({
    order: db.prepare("SELECT * FROM orders WHERE id=?").get(orderId),
    parcel: db.prepare("SELECT * FROM parcels WHERE order_id=?").get(orderId),
  });
});

/* -------------------------------------------------------------------------- */
/*                               ADMIN WEIGHS                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST /:orderId/weigh
 * Admin records the physical weight of a parcel. Calculates a suggested quote
 * amount based on the current rate_config for the parcel's direction.
 */
router.post("/:orderId/weigh", requireAuth, requireAdmin, (req, res) => {
  if (!isPositiveInteger(req.params.orderId)) {
    return res.status(400).json({ error: "Invalid order ID" });
  }

  const { weight_kg } = req.body;

  if (!isPositiveFinite(weight_kg)) {
    return res.status(400).json({
      error: "weight_kg must be a finite number greater than zero",
    });
  }

  const parcel = db
    .prepare("SELECT * FROM parcels WHERE order_id=?")
    .get(req.params.orderId);

  if (!parcel) {
    return res.status(404).json({ error: "Parcel not found" });
  }

  const rate = db
    .prepare("SELECT * FROM rate_config WHERE direction=?")
    .get(parcel.direction);

  const suggested = rate
    ? Math.round(weight_kg * rate.rate_per_kg * 100) / 100
    : null;

  try {
    db.prepare(`
      UPDATE parcels
      SET
        weight_kg=?,
        suggested_amount=?
      WHERE order_id=?
    `).run(weight_kg, suggested, req.params.orderId);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update parcel weight" });
  }

  res.json({
    weight_kg,
    suggested_amount: suggested,
    currency: rate?.currency ?? null,
    rate_per_kg: rate?.rate_per_kg ?? null,
  });
});

/* -------------------------------------------------------------------------- */
/*                                ADMIN QUOTE                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST /:orderId/quote
 * Admin sets the final quoted price for a weighed parcel and advances the
 * order status to "quoted".
 */
router.post("/:orderId/quote", requireAuth, requireAdmin, async (req, res) => {
  if (!isPositiveInteger(req.params.orderId)) {
    return res.status(400).json({ error: "Invalid order ID" });
  }

  const { quote_amount } = req.body;

  if (!isPositiveFinite(quote_amount)) {
    return res.status(400).json({
      error: "quote_amount must be a finite number greater than zero",
    });
  }

  const parcel = db
    .prepare("SELECT * FROM parcels WHERE order_id=?")
    .get(req.params.orderId);

  if (!parcel) {
    return res.status(404).json({ error: "Parcel not found" });
  }

  if (!parcel.weight_kg) {
    return res.status(400).json({ error: "Parcel must be weighed first" });
  }

  try {
    db.prepare(`
      UPDATE parcels
      SET
        quote_amount=?,
        quoted_at=datetime('now'),
        quoted_by=?
      WHERE order_id=?
    `).run(quote_amount, req.user.id, req.params.orderId);

    db.prepare(`
      UPDATE orders
      SET total_amount=?
      WHERE id=?
    `).run(quote_amount, req.params.orderId);
  } catch (err) {
    return res.status(500).json({ error: "Failed to save quote" });
  }

  try {
    const order = await updateStatus(req.params.orderId, "quoted", {
      note: `Quoted at ${quote_amount}`,
      changedBy: req.user.id,
    });

    res.json(order);
  } catch (err) {
    const isBusinessError = err.message && !err.message.toLowerCase().includes("sqlite");
    res.status(isBusinessError ? 400 : 500).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                       CUSTOMER CHOOSES PAYMENT METHOD                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /:orderId/payment/method
 * Customer selects a payment method (upi or momo) for a quoted parcel order.
 * Creates the payment record and advances status to payment_pending.
 * Rejects if a payment record already exists for this order.
 */
router.post("/:orderId/payment/method", requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.orderId)) {
    return res.status(400).json({ error: "Invalid order ID" });
  }

  const { method } = req.body;

  if (!["upi", "momo"].includes(method)) {
    return res.status(400).json({
      error: "method must be upi or momo",
    });
  }

  const order = db
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
        AND customer_id = ?
    `)
    .get(req.params.orderId, req.user.id);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  if (order.status !== "quoted") {
    return res.status(400).json({
      error: "Order must be in quoted status",
    });
  }

  // Prevent duplicate payment record creation
  const existingPayment = db
    .prepare("SELECT id FROM payments WHERE order_id = ?")
    .get(order.id);
  if (existingPayment) {
    return res.status(400).json({
      error: "Payment record already exists for this order",
    });
  }

  try {
    createParcelPayment(order.id, order.total_amount, method);
  } catch (err) {
    return res.status(500).json({ error: "Failed to create payment record" });
  }

  try {
    await updateStatus(order.id, "payment_pending", {
      note: `Customer selected ${method}`,
      changedBy: null,
    });
  } catch (err) {
    const isBusinessError = err.message && !err.message.toLowerCase().includes("sqlite");
    return res.status(isBusinessError ? 400 : 500).json({ error: err.message });
  }

  if (method === "upi") {
    return res.json({
      method,
      upi_link: buildUpiLink(order.total_amount, order.tracking_code),
      amount: order.total_amount,
    });
  }

  res.json({
    method,
    momo_numbers: momoNumbers(),
    amount: order.total_amount,
  });
});

/* -------------------------------------------------------------------------- */
/*                    CUSTOMER SUBMITS PAYMENT REFERENCE                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /:orderId/payment/reference
 * Customer submits a payment reference number (UPI UTR or MoMo transaction ID).
 * Requires a payment record to already exist for the order.
 */
router.post("/:orderId/payment/reference", requireAuth, (req, res) => {
  if (!isPositiveInteger(req.params.orderId)) {
    return res.status(400).json({ error: "Invalid order ID" });
  }

  const { reference_number } = req.body;

  if (!isNonEmptyString(reference_number)) {
    return res.status(400).json({
      error: "reference_number must be a non-empty string",
    });
  }

  const order = db
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
        AND customer_id = ?
    `)
    .get(req.params.orderId, req.user.id);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  // Ensure a payment record exists before attempting to attach a reference
  const payment = db
    .prepare("SELECT id FROM payments WHERE order_id = ?")
    .get(order.id);
  if (!payment) {
    return res.status(400).json({
      error: "No payment record found for this order",
    });
  }

  try {
    const updatedPayment = submitReference(order.id, reference_number.trim());
    res.json(updatedPayment);
  } catch (err) {
    const isBusinessError = err.message && !err.message.toLowerCase().includes("sqlite");
    res.status(isBusinessError ? 400 : 500).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                        ADMIN CONFIRMS PAYMENT                              */
/* -------------------------------------------------------------------------- */

/**
 * POST /:orderId/payment/confirm
 * Admin verifies and confirms the customer's payment, then advances the order
 * to "confirmed" status. Requires a payment record to exist.
 */
router.post(
  "/:orderId/payment/confirm",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    if (!isPositiveInteger(req.params.orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    // Ensure a payment record exists before attempting to verify
    const payment = db
      .prepare("SELECT id FROM payments WHERE order_id = ?")
      .get(req.params.orderId);
    if (!payment) {
      return res.status(400).json({
        error: "No payment record found for this order",
      });
    }

    try {
      const confirmedPayment = verifyPayment(req.params.orderId, req.user.id);

      const order = await updateStatus(req.params.orderId, "confirmed", {
        note: "Payment verified by admin",
        changedBy: req.user.id,
      });

      res.json({ order, payment: confirmedPayment });
    } catch (err) {
      const isBusinessError = err.message && !err.message.toLowerCase().includes("sqlite");
      res.status(isBusinessError ? 400 : 500).json({ error: err.message });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                             RATE CONFIGURATION                             */
/* -------------------------------------------------------------------------- */

/**
 * GET /rates
 * Admin retrieves all shipping rate configurations.
 */
router.get("/rates", requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM rate_config").all());
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /rates/:direction
 * Admin updates the rate_per_kg for a given shipping direction.
 * direction must be a known value present in rate_config.
 */
router.patch("/rates/:direction", requireAuth, requireAdmin, (req, res) => {
  const { direction } = req.params;

  if (!["india_to_uganda", "uganda_to_india"].includes(direction)) {
    return res.status(400).json({
      error: "direction must be india_to_uganda or uganda_to_india",
    });
  }

  const { rate_per_kg } = req.body;

  if (!isPositiveFinite(rate_per_kg)) {
    return res.status(400).json({
      error: "rate_per_kg must be a finite number greater than zero",
    });
  }

  let result;
  try {
    result = db
      .prepare(`
        UPDATE rate_config
        SET
          rate_per_kg = ?,
          updated_at = datetime('now')
        WHERE direction = ?
      `)
      .run(rate_per_kg, direction);
  } catch (err) {
    return res.status(500).json({ error: "Failed to update rate" });
  }

  if (result.changes === 0) {
    return res.status(404).json({ error: "Unknown direction" });
  }

  res.json(
    db
      .prepare("SELECT * FROM rate_config WHERE direction = ?")
      .get(direction)
  );
});

module.exports = router;