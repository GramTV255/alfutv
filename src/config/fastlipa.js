// FastLipa: Bearer secret token kwa maombi yote; saini ya webhook (X-FastLipa-Signature: sha256=<hex>)
const crypto = require('crypto');
const { query } = require('./database');
const { encrypt, decrypt } = require('../utils/secret-box');

const BASE = (process.env.FASTLIPA_BASE_URL || 'https://api.fastlipa.com/v1').replace(/\/+$/, '');

class FLError extends Error {
  constructor(message, status) { super(message); this.name = 'FLError'; this.status = status || 502; }
}

// api_key_enc = secret token (Bearer); webhook_secret_enc = webhook signing secret
async function getCreds() {
  const r = await query("SELECT api_key_enc, webhook_secret_enc FROM payment_provider_settings WHERE provider='fastlipa'");
  const row = r.rows[0] || {};
  const d = (v) => { try { return v ? decrypt(v) : null; } catch (_) { return null; } };
  return { token: d(row.api_key_enc), signing: d(row.webhook_secret_enc) };
}
async function configured() { return !!(await getCreds()).token; }

async function call(method, path, body) {
  const c = await getCreds();
  if (!c.token) throw new FLError('Secret token ya FastLipa haijawekwa.', 500);
  let r, j = {};
  try {
    r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + c.token },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw new FLError('Imeshindwa kuwasiliana na FastLipa.', 0); }
  if (!r.ok || j.status === false) throw new FLError(j.message || ('FastLipa HTTP ' + r.status), r.status);
  return j.data !== undefined ? j.data : j;
}

const createTransaction = (b) => call('POST', '/transaction/create', b);
const transactionStatus = (tranid) => call('GET', '/transaction/status?tranid=' + encodeURIComponent(tranid));
const createPayout = (b) => call('POST', '/payout/send', b);
const payoutStatus = (tranid) => call('GET', '/payout/status?tranid=' + encodeURIComponent(tranid));
const webhookSecretShow = () => call('GET', '/webhook_secret/show');
const webhookUrl = (p) => (process.env.BASE_URL || '').replace(/\/+$/, '') + p;

function verifyWebhook(raw, sigHeader, secret) {
  if (!sigHeader || !secret || !Buffer.isBuffer(raw)) return false;
  const want = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = String(sigHeader).trim().toLowerCase();
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

module.exports = { BASE, FLError, getCreds, configured, call, createTransaction, transactionStatus, createPayout, payoutStatus, webhookSecretShow, webhookUrl, verifyWebhook, encrypt };
