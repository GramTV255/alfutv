'use strict';
/**
 * ClickPesa client. Endpoints and fields follow the official docs (https://docs.clickpesa.com):
 *   POST {base}/generate-token                          headers: client-id, api-key  -> { success, token }  (token already starts with "Bearer ", valid 1 hour)
 *   POST {base}/payments/preview-ussd-push-request      body: amount, currency, orderReference, phoneNumber, [checksum]
 *   POST {base}/payments/initiate-ussd-push-request     body: amount, currency, orderReference, phoneNumber, [checksum]
 *   GET  {base}/payments/{orderReference}               -> array of payment attempts
 * Checksum (when enabled in the ClickPesa dashboard): HMAC-SHA256 (hex) over the compact JSON of the payload with keys
 * sorted recursively, excluding `checksum` and `checksumMethod`. Webhooks are signed the same way.
 * base = https://api.clickpesa.com/third-parties.  ClickPesa has no sandbox: tests run live with small amounts.
 */
const crypto = require('crypto');
const { config } = require('../config');
const { getSetting } = require('./settingsService');
const { HttpError } = require('../utils/errors');
const logger = require('../utils/logger');

let cachedToken = null; // { token, expiresAt }

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  return Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = canonicalize(obj[k]);
    return acc;
  }, {});
}

function createChecksum(checksumKey, payload) {
  const clean = { ...payload };
  delete clean.checksum;
  delete clean.checksumMethod;
  return crypto.createHmac('sha256', checksumKey).update(JSON.stringify(canonicalize(clean))).digest('hex');
}

function verifyChecksum(checksumKey, payload, received) {
  if (!received || typeof received !== 'string') return false;
  const expected = createChecksum(checksumKey, payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getCredentials() {
  const [clientId, apiKey, checksumKey] = await Promise.all([
    getSetting('clickpesa_client_id'),
    getSetting('clickpesa_api_key'),
    getSetting('clickpesa_checksum_key'),
  ]);
  return { clientId, apiKey, checksumKey };
}

function resetTokenCache() {
  cachedToken = null;
}

async function http(method, url, { headers = {}, body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text.slice(0, 300) }; }
    return { status: res.status, data };
  } catch (e) {
    throw new HttpError(502, e.name === 'AbortError' ? 'ClickPesa haikujibu kwa wakati' : 'Imeshindwa kuwasiliana na ClickPesa', 'CLICKPESA_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(force = false) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const { clientId, apiKey } = await getCredentials();
  if (!clientId || !apiKey) throw new HttpError(503, 'Malipo hayajawekwa bado. Wasiliana na msimamizi.', 'CLICKPESA_NOT_CONFIGURED');
  const r = await http('POST', `${config.clickpesa.baseUrl}/generate-token`, {
    headers: { 'client-id': clientId, 'api-key': apiKey },
  });
  if (r.status !== 200 || !r.data || !r.data.token) {
    logger.warn('ClickPesa generate-token failed', { status: r.status, message: r.data && r.data.message });
    throw new HttpError(502, `ClickPesa imekataa credentials (${(r.data && r.data.message) || r.status})`, 'CLICKPESA_AUTH_FAILED');
  }
  // Token is valid for 1 hour; refresh a little early.
  cachedToken = { token: r.data.token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return cachedToken.token;
}

async function authed(method, path, body) {
  const doCall = async (force) => {
    const token = await getToken(force);
    return http(method, `${config.clickpesa.baseUrl}${path}`, { headers: { Authorization: token }, body });
  };
  let r = await doCall(false);
  if (r.status === 401) {
    resetTokenCache();
    r = await doCall(true); // one refresh only
  }
  return r;
}

async function signedBody(fields) {
  const { checksumKey } = await getCredentials();
  const body = { ...fields };
  if (checksumKey) body.checksum = createChecksum(checksumKey, fields);
  return body;
}

const ussdFields = ({ amount, orderReference, phoneNumber }) => ({
  amount: String(amount),
  currency: 'TZS',
  orderReference,
  phoneNumber,
});

async function previewUssdPush(p) {
  return authed('POST', '/payments/preview-ussd-push-request', await signedBody(ussdFields(p)));
}

async function initiateUssdPush(p) {
  return authed('POST', '/payments/initiate-ussd-push-request', await signedBody(ussdFields(p)));
}

async function queryPayment(orderReference) {
  const r = await authed('GET', `/payments/${encodeURIComponent(orderReference)}`);
  return { status: r.status, attempts: Array.isArray(r.data) ? r.data : [], message: r.data && r.data.message };
}

// Admin "Test connection": obtains a fresh token with the saved credentials (no money moves).
async function testConnection() {
  resetTokenCache();
  try {
    await getToken(true);
    return { ok: true, message: 'Muunganisho umefanikiwa. Token imepatikana kutoka ClickPesa.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = {
  createChecksum, verifyChecksum, getCredentials, resetTokenCache, previewUssdPush, initiateUssdPush, queryPayment, testConnection, canonicalize,
};
