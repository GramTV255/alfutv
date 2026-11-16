// Namba za TZ: 0712345678 / +255712345678 / 255712345678 -> 255712345678
function normalizePhone(v) {
  let p = String(v || '').replace(/[\s\-()]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (/^0\d{9}$/.test(p)) p = '255' + p.slice(1);
  return /^255[67]\d{8}$/.test(p) ? p : null;
}
const isStr = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const isInt = (v, min, max) => Number.isInteger(v) && v >= (min ?? -Infinity) && v <= (max ?? Infinity);
const isUrl = (v) => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol); } catch (_) { return false; } };
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function httpErr(status, message) { const e = new Error(message); e.status = status; e.expose = true; return e; }
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { normalizePhone, isStr, isInt, isUrl, isHex, httpErr, ah };
