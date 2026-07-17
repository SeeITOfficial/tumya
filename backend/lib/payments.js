const db = require('../db');

const UPI_ID = process.env.UPI_ID; // ssstephenel@oksbi
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'Tumya';
const MOMO_NUMBER_PRIMARY = process.env.MOMO_NUMBER_PRIMARY;   // +256709877737
const MOMO_NUMBER_SECONDARY = process.env.MOMO_NUMBER_SECONDARY; // +256757244016

if (!UPI_ID) console.warn('WARNING: UPI_ID not set in env — UPI links will be broken.');
if (!MOMO_NUMBER_PRIMARY) console.warn('WARNING: MOMO_NUMBER_PRIMARY not set in env.');

/** Builds the upi://pay deep link used both for catalog QR-reveal and parcel UPI payment. */
function buildUpiLink(amount, note) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tn: note || 'Tumya order',
  });
  return `upi://pay?${params.toString()}`;
}

function momoNumbers() {
  return { primary: MOMO_NUMBER_PRIMARY, secondary: MOMO_NUMBER_SECONDARY };
}

/** Creates the single payment row for a catalog order at checkout time. Always COD. */
function createCatalogPayment(orderId, totalAmount, paymentMode) {
  const method = paymentMode === 'cod_upi_scan' ? 'upi_scan' : 'cod';
  db.prepare(
    `INSERT INTO payments (order_id, method, amount, status) VALUES (?, ?, ?, 'pending')`
  ).run(orderId, method, totalAmount);
}

/** Creates the single payment row for a parcel once quoted. Method chosen by customer (upi or momo). */
function createParcelPayment(orderId, quoteAmount, method) {
  if (!['upi', 'momo'].includes(method)) throw new Error('Parcel payment method must be upi or momo');
  db.prepare(
    `INSERT INTO payments (order_id, method, amount, status) VALUES (?, ?, ?, 'pending')`
  ).run(orderId, method, quoteAmount);
}

/** Customer (or admin, at COD-scan handoff) submits/updates the reference number. */
function submitReference(orderId, referenceNumber) {
  const result = db
    .prepare(`UPDATE payments SET reference_number = ? WHERE order_id = ?`)
    .run(referenceNumber, orderId);
  if (result.changes === 0) throw new Error('Payment record not found for this order');
  return db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
}

/** Admin verifies payment — manual confirm, no gateway callback exists for this stack. */
function verifyPayment(orderId, adminUserId) {
  const result = db
    .prepare(
      `UPDATE payments SET status = 'verified', verified_by = ?, verified_at = datetime('now')
       WHERE order_id = ?`
    )
    .run(adminUserId, orderId);
  if (result.changes === 0) throw new Error('Payment record not found for this order');
  return db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
}

/** cod_cash catalog orders have no reference number — admin marks paid directly at handoff. */
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
