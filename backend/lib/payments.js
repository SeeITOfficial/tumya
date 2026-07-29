const db = require("../db");

const UPI_ID = process.env.UPI_ID;
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || "Tumya";

const MOMO_NUMBER_PRIMARY = process.env.MOMO_NUMBER_PRIMARY;
const MOMO_NUMBER_SECONDARY = process.env.MOMO_NUMBER_SECONDARY;

if (!UPI_ID) {
  console.warn("WARNING: UPI_ID not set in environment variables.");
}

if (!MOMO_NUMBER_PRIMARY) {
  console.warn("WARNING: MOMO_NUMBER_PRIMARY not set in environment variables.");
}

/**
 * Build a UPI payment link.
 */
function buildUpiLink(amount, note = "Tumya order") {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: Number(amount).toFixed(2),
    cu: "INR",
    tn: note,
  });

  return `upi://pay?${params.toString()}`;
}

/**
 * Return available MoMo numbers.
 */
function momoNumbers() {
  return {
    primary: MOMO_NUMBER_PRIMARY,
    secondary: MOMO_NUMBER_SECONDARY,
  };
}

/**
 * Create payment for a catalog order.
 */
function createCatalogPayment(orderId, totalAmount, paymentMode) {
  const method = paymentMode === "cod_upi_scan"
    ? "upi_scan"
    : "cod";

  db.prepare(`
    INSERT INTO payments
    (order_id, method, amount, status)
    VALUES (?, ?, ?, 'pending')
  `).run(orderId, method, totalAmount);
}

/**
 * Create payment for a parcel order.
 */
function createParcelPayment(orderId, quoteAmount, method) {
  if (!["upi", "momo"].includes(method)) {
    throw new Error("Parcel payment method must be 'upi' or 'momo'.");
  }

  db.prepare(`
    INSERT INTO payments
    (order_id, method, amount, status)
    VALUES (?, ?, ?, 'pending')
  `).run(orderId, method, quoteAmount);
}

/**
 * Save or update a payment reference number.
 */
function submitReference(orderId, referenceNumber) {
  const result = db.prepare(`
    UPDATE payments
    SET reference_number = ?
    WHERE order_id = ?
  `).run(referenceNumber, orderId);

  if (result.changes === 0) {
    throw new Error("Payment record not found.");
  }

  return db
    .prepare("SELECT * FROM payments WHERE order_id = ?")
    .get(orderId);
}

/**
 * Verify payment.
 */
function verifyPayment(orderId, adminUserId) {
  const payment = db
    .prepare("SELECT * FROM payments WHERE order_id = ?")
    .get(orderId);

  if (!payment) {
    throw new Error("Payment record not found.");
  }

  if (payment.status === "verified") {
    return payment;
  }

  db.prepare(`
    UPDATE payments
    SET
      status = 'verified',
      verified_by = ?,
      verified_at = datetime('now')
    WHERE order_id = ?
  `).run(adminUserId, orderId);

  return db
    .prepare("SELECT * FROM payments WHERE order_id = ?")
    .get(orderId);
}

/**
 * Mark a COD cash payment as paid.
 */
function markCodCashPaid(orderId, adminUserId) {
  return verifyPayment(orderId, adminUserId);
}

module.exports = {
  buildUpiLink,
  momoNumbers,
  createCatalogPayment,
  createParcelPayment,
  submitReference,
  verifyPayment,
  markCodCashPaid,
  UPI_ID,
};