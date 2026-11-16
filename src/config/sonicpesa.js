// SonicPesa: API Key (X-API-KEY) kwa malipo, API Secret (X-API-SECRET) kwa payouts na saini ya webhook.
const crypto = require('crypto');
const { query } = require('./database');
const { encrypt, decrypt } = require('../utils/secret-box');

const BASE = (process.env.SONICPESA_BASE_URL || 'https://api.sonicpesa.com/api/v1').replace(/\/+$/, '');

class SPError extends Error {
  constructor(message, status) { super(message); this.name = 'SPError'; this.status = status || 502; }
}

// api_key_enc = API Key; webhook_secret_enc = API Secret
async function getCreds() {
  const r = await query("SELECT api_key_enc, webhook_secret_enc FROM payment_provider_settings WHERE provider='sonicpesa'");
  const row = r.rows[0] || {};
  const d = (v) => { try { return v ? decrypt(v) : null; } catch (_) { return null; } };
  return { apiKey: d(row.api_key_enc), apiSecret: d(row.webhook_secret_enc) };
}
async function configured() {
  const c = await getCreds();
  return !!(c.apiKey && c.apiSecret);
}

async function call(method, path, body, { payout = false } = {}) {
  const c = await getCreds();
  if (!c.apiKey) throw new SPError('API Key ya SonicPesa haijawekwa.', 500);
  if (payout && !c.apiSecret) throw new SPError('API Secret ya SonicPesa haijawekwa.', 500);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': c.apiKey };
  if (payout) headers['X-API-SECRET'] = c.apiSecret;
  let r, j = {};
  try {
    r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw new SPError('Imeshindwa kuwasiliana na SonicPesa.', 0); }
  if (!r.ok || j.status === 'error') throw new SPError(j.message || ('SonicPesa HTTP ' + r.status), r.status);
  return j.data !== undefined ? j.data : j;
}

const createOrder = (b) => call('POST', '/payment/create_order', b);
const orderStatus = (orderId) => call('POST', '/payment/order_status', { order_id: orderId });
const createPayout = (b) => call('POST', '/payouts/create', b, { payout: true });
const payoutStatus = (id) => call('GET', '/payouts/status/' + encodeURIComponent(id), null, { payout: true });

// Saini: HMAC-SHA256 ya raw body kwa API Secret, kwenye header X-SonicPesa-Signature
function verifyWebhook(raw, sigHeader, secret) {
  if (!sigHeader || !secret || !Buffer.isBuffer(raw)) return false;
  const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = String(sigHeader).trim().toLowerCase();
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

module.exports = { BASE, SPError, getCreds, configured, call, createOrder, orderStatus, createPayout, payoutStatus, verifyWebhook, encrypt };
