'use strict';
const express = require('express');
const { query } = require('../database/pool');
const { wrap, HttpError } = require('../utils/errors');
const v = require('../validators');
const { config } = require('../config');
const { requireAuth, csrfProtect, requireUserRole } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const apiKeys = require('../services/apiKeyService');
const { getSubscriptionView } = require('../services/subscriptionService');
const { userUsage } = require('../services/statsService');
const payments = require('../services/paymentService');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();
router.use(requireAuth, csrfProtect, requireUserRole);

const endpointUrl = (req) => `${config.publicBaseUrl || `${req.protocol}://${req.get('host')}`}/api/v1/amiri`;

router.get('/overview', wrap(async (req, res) => {
  const u = req.user;
  const [key, subscription, usage, packages, pay, srcs] = await Promise.all([
    apiKeys.getLiveKey(u.id),
    getSubscriptionView(u.id),
    userUsage(u.id),
    query(`SELECT id, name, price, duration_days FROM packages WHERE status='ACTIVE' ORDER BY price ASC`),
    query(`SELECT p.transaction_id, p.amount, p.currency, p.payment_status, p.failure_message, p.created_at, p.confirmed_at, k.name AS package_name
             FROM payments p JOIN packages k ON k.id=p.package_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 30`, [u.id]),
    query(`SELECT id, slug, name FROM amiri_channels WHERE status='ACTIVE' ORDER BY id ASC`),
  ]);
  // Effective key status follows the subscription clock even if the scheduler has not run yet.
  let keyStatus = key ? key.status : 'NONE';
  if (key && keyStatus === 'ACTIVE' && subscription.status !== 'ACTIVE') keyStatus = 'INACTIVE';
  res.json({
    account: { full_name: u.full_name, phone_number: u.phone_number, user_id: u.id, account_status: u.account_status, created_at: u.created_at },
    api: { endpoint: endpointUrl(req), key_prefix: key ? key.key_prefix : null, key_status: keyStatus, header: 'X-API-Key',
      channels: srcs.rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, endpoint: `${endpointUrl(req)}/${c.slug}` })) },
    subscription,
    packages: packages.rows,
    payments: pay.rows,
    usage,
  });
}));

// The full key is shown exactly once, here. Only its hash is stored.
router.post('/api-key/regenerate', wrap(async (req, res) => {
  const k = await apiKeys.regenerateKey(req.user.id);
  res.json({ ok: true, api_key: k.apiKey, key_prefix: k.key_prefix, status: k.status, message: 'Hifadhi API Key hii sasa. Haitaonyeshwa tena.' });
}));

router.delete('/api-key', wrap(async (req, res) => {
  await apiKeys.revokeKey(req.user.id);
  res.json({ ok: true, message: 'API Key imefutwa. Haitakubali maombi mapya.' });
}));

router.post('/payments', paymentLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const packageId = v.int(b.packageId, 'Kifurushi');
  const phone = b.phone ? v.phone(b.phone, 'Namba ya malipo') : normalizePhone(req.user.phone_number);
  const r = await payments.initiatePayment({ user: req.user, packageId, phone });
  res.status(202).json({ ok: true, ...r });
}));

// The status endpoint asks ClickPesa itself (official query API) - it never trusts what the browser says.
router.get('/payments/:ref/status', paymentLimiter, wrap(async (req, res) => {
  const ref = req.params.ref;
  if (!/^[A-Za-z0-9]{1,20}$/.test(ref)) throw new HttpError(400, 'Reference si sahihi');
  let p = (await query('SELECT transaction_id, payment_status, failure_message FROM payments WHERE transaction_id=$1 AND user_id=$2', [ref, req.user.id])).rows[0];
  if (!p) throw new HttpError(404, 'Malipo hayapatikani');
  if (p.payment_status === 'PENDING' || p.payment_status === 'PROCESSING') {
    try { await payments.verifyPayment(ref); } catch (_) { /* provider hiccup: show last known state */ }
    p = (await query('SELECT transaction_id, payment_status, failure_message FROM payments WHERE transaction_id=$1 AND user_id=$2', [ref, req.user.id])).rows[0];
  }
  res.json({ transaction_id: p.transaction_id, status: p.payment_status, message: p.payment_status === 'FAILED' ? p.failure_message : undefined });
}));

module.exports = router;
