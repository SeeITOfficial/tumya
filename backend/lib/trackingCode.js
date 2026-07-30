// Short, human-readable tracking codes: TMY-XXXXXX (uppercase alphanumeric, no ambiguous chars)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

const db = require('../db');

const checkExists = db.prepare('SELECT 1 FROM orders WHERE tracking_code = ?');

function generateTrackingCode() {
  while (true) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    const candidate = `TMY-${code}`;
    if (!checkExists.get(candidate)) {
      return candidate;
    }
  }
}

module.exports = { generateTrackingCode };
