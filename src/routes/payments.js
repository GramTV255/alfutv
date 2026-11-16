// Malipo ya mtumiaji (ClickPesa)
const router = require('express').Router();
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rate-limit');
const svc = require('../services/payment-service');
const { ah, httpErr } = require('../utils/validation');

const COLS = `p.id,p.order_id,p.provider_reference AS reference,COALESCE(k.name, 'Channel: ' || ch.name, 'Mechi #' || p.match_id, 'Programu #' || p.app_release_id) AS package_name,p.amount,p.currency,p.status,p.failure_reason,p.created_at,p.completed_at`;

router.get('/me', requireAuth, ah(async (req, res) => {
  const r = await query(`SELECT ${COLS} FROM payments p LEFT JOIN packages k ON k.id=p.package_id LEFT JOIN channels ch ON ch.id=p.channel_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 5`, [req.user.id]);
  res.json({ payments: r.rows });
}));

router.post('/create', requireAuth, paymentLimiter, ah(async (req, res) => {
  const { package_id, channel_id, match_id, phone } = req.body || {};
  if (!Number.isInteger(package_id) && !Number.isInteger(channel_id) && !Number.isInteger(match_id)) throw httpErr(400, 'Chagua kifurushi, channel au mechi.');
  res.status(201).json(await svc.createPayment(req.user, { packageId: package_id, channelId: Number.isInteger(channel_id) ? channel_id : null, matchId: Number.isInteger(match_id) ? match_id : null, phone }));
}));

async function own(req) {
  const p = (await query('SELECT * FROM payments WHERE id=$1 AND user_id=$2', [parseInt(req.params.id, 10) || 0, req.user.id])).rows[0];
  if (!p) throw httpErr(404, 'Malipo hayapatikani.');
  return p;
}

// Polling: ikiwa PENDING, thibitisha na ClickPesa (webhook ikichelewa)
router.get('/:id', requireAuth, ah(async (req, res) => {
  let p = await own(req);
  if (p.status === 'PENDING') { try { p = await svc.refreshFromProvider(p); } catch (_) {} }
  res.json({ payment: { id: p.id, order_id: p.order_id, status: p.status, amount: p.amount, currency: p.currency, failure_reason: p.failure_reason } });
}));

module.exports = router;
