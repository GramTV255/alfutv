'use strict';

// Normalises Tanzanian numbers to 255XXXXXXXXX (12 digits, mobile prefixes 6/7). Returns null when invalid.
// Accepted: 0712345678, 712345678, 255712345678, +255712345678, 0712 345 678
function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let d = input.replace(/[\s\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('255')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^[67]\d{8}$/.test(d)) return null;
  return `255${d}`;
}

module.exports = { normalizePhone };
