// Short, human-readable tracking codes: TMY-XXXXXX (uppercase alphanumeric, no ambiguous chars)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

function generateTrackingCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `TMY-${code}`;
}

module.exports = { generateTrackingCode };
