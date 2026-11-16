// ClickPesa: token (client-id + api-key), saini ya checksum, na wito wa API.
const crypto = require('crypto');
const { query } = require('./database');
const { encrypt, decrypt } = require('../utils/secret-box');

const BASE = (process.env.CLICKPESA_BASE_URL || 'https://api.clickpesa.com/third-parties').replace(/\/+$/, '');

class CPError extends Error {
  constructor(message, status) { super(message); this.name = 'CPError'; this.status = status || 502; }
}

async function getCreds() {
  const r = await query("SELECT client_id_enc, api_key_enc, webhook_secret_enc FROM payment_provider_settings WHERE provider='clickpesa'");
  const row = r.rows[0] || {};
  const d = (v) => { try { return v ? decrypt(v) : null; } catch (_) { return null; } };
  return { clientId: d(row.client_id_enc), apiKey: d(row.api_key_enc), checksumKey: d(row.webhook_secret_enc) };
}
async function configured() {
  const c = await getCreds();
  return !!(c.clientId && c.apiKey && c.checksumKey);
}

// ---- Checksum: funguo zilizopangwa kialfabeti kila ngazi, JSON fupi, HMAC-SHA256 ----
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.keys(v).sort().reduce((a, k) => { a[k] = canon(v[k]); return a; }, {})
  : v);
const strip = (o) => { const x = { ...o }; delete x.checksum; delete x.checksumMethod; return x; };
const canonStr = (o) => JSON.stringify(canon(strip(o)));
function sign(o, key) { return crypto.createHmac('sha256', key).update(canonStr(o)).digest('hex'); }
function verifyWebhook(body, key) {
  const got = String(body.checksum || '').trim();
  if (!got) return false;
  const hex = crypto.createHmac('sha256', key).update(canonStr(body)).digest('hex');
  const b64 = crypto.createHmac('sha256', key).update(canonStr(body)).digest('base64');
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  return same(got.toLowerCase(), hex) || same(got, b64);
}

// ---- Token: inadumu saa 1, tunaihifadhi dakika 55 ----
let tok = null, tokExp = 0;
function resetToken() { tok = null; tokExp = 0; }
async function token(force = false) {
  if (!force && tok && Date.now() < tokExp) return tok;
  const c = await getCreds();
  if (!c.clientId || !c.apiKey) throw new CPError('Client ID na API Key hazijawekwa.', 500);
  let r, j = {};
  try {
    r = await fetch(BASE + '/generate-token', {
      method: 'POST',
      headers: { 'client-id': c.clientId, 'api-key': c.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw new CPError('Imeshindwa kuwasiliana na ClickPesa.', 0); }
  if (!r.ok || !j.token || j.success === false) throw new CPError(j.message || ('Token imeshindikana (HTTP ' + r.status + ')'), r.status || 502);
  tok = j.token.startsWith('Bearer ') ? j.token : 'Bearer ' + j.token;
  tokExp = Date.now() + 55 * 60 * 1000;
  return tok;
}

async function call(method, path, body) {
  const auth = await token();
  const c = await getCreds();
  const payload = body ? (c.checksumKey ? { ...body, checksum: sign(body, c.checksumKey) } : body) : undefined;
  let r, j = {};
  try {
    r = await fetch(BASE + path, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw new CPError('Imeshindwa kuwasiliana na ClickPesa.', 0); }
  if (r.status === 401) resetToken();
  if (!r.ok) throw new CPError(j.message || j.error || ('ClickPesa HTTP ' + r.status), r.status);
  return j;
}

// Preview kwanza (kuthibitisha namba na njia), kisha initiate ya USSD-PUSH
async function startUssd({ orderId, amount, msisdn }) {
  const body = { amount: String(amount), currency: 'TZS', orderReference: orderId, phoneNumber: msisdn };
  await call('POST', '/payments/preview-ussd-push-request', body);
  return call('POST', '/payments/initiate-ussd-push-request', body);
}

// Hali ya malipo kwa orderReference. (Njia ya endpoint hii haijathibitishwa kwenye nyaraka: angalia README.)
async function queryStatus(orderId) {
  const j = await call('GET', '/payments/' + encodeURIComponent(orderId));
  const list = Array.isArray(j) ? j : (Array.isArray(j.data) ? j.data : [j]);
  return list[list.length - 1] || {};
}

// Malipo na hali yake
const paymentStatus = (orderId) => queryStatus(orderId);
const paymentsAll = () => call('GET', '/payments/all?orderBy=DESC&limit=20');

// Salio na statement
const balance = () => call('GET', '/account/balance');
const statement = () => call('GET', '/account/statement');

// Payouts za simu (M-Pesa, Tigo, Airtel, Halo)
const previewMobilePayout = (b) => call('POST', '/payouts/preview-mobile-money-payout', b);
const createMobilePayout = (b) => call('POST', '/payouts/create-mobile-money-payout', b);
const payoutStatus = (ref) => call('GET', '/payouts/' + encodeURIComponent(ref));
const payoutsAll = () => call('GET', '/payouts/all?orderBy=DESC&limit=20');

module.exports = { BASE, CPError, getCreds, configured, sign, verifyWebhook, token, resetToken, call, startUssd, queryStatus, encrypt,
  paymentStatus, paymentsAll, balance, statement, previewMobilePayout, createMobilePayout, payoutStatus, payoutsAll };
