// Salio, statement, malipo na payouts za ClickPesa (admin)
const router = require('express').Router();
const { query } = require('../config/database');
const cp = require('../config/clickpesa');
const svc = require('../services/payout-service');
const { ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');

const wrap = (fn) => ah(async (req, res) => {
  try { await fn(req, res); }
  catch (e) { if (e.name === 'CPError') return res.status(502).json({ error: e.message }); throw e; }
});

// Salio la ndani: malipo yote yaliyokamilika kutoka kwa wateja, ukitoa kiasi cha payouts zinazoendelea au zilizokamilika.
// Payout inatoa kiasi pamoja na makato (fee) kutoka kwenye salio.
// Payout iliyoshindwa au kurudishwa haipunguzi salio.
const ledger = async () => {
  const pv = await require('../config/provider').getActive();
  const r = await query(`SELECT
      (SELECT COALESCE(SUM(amount),0)::bigint FROM payments WHERE status='COMPLETED' AND provider=$1) AS collected,
      (SELECT COALESCE(SUM(amount+fee),0)::bigint FROM payouts WHERE status IN ('PENDING','PROCESSING','COMPLETED') AND provider=$1) AS paid_out`, [pv]);
  const collected = Number(r.rows[0].collected), paid_out = Number(r.rows[0].paid_out);
  // Kamisheni za promo ambazo bado hazijalipwa zinatolewa kwenye salio la mfumo.
  // Payout ikikamilika, kiasi kilichotolewa kinarudi kwenye salio la mfumo.
  const lb = await query(`SELECT
      (SELECT COALESCE(SUM(c.commission),0)::bigint FROM promo_commissions c JOIN payments p ON p.id=c.payment_id
         WHERE c.status='CREDITED' AND p.provider=$1)
      - (SELECT COALESCE(SUM(amount),0)::bigint FROM promo_payouts WHERE status='PAID') AS owed`, [pv]);
  const owed = Number(lb.rows[0].owed);
  return { collected, paid_out, owed, value: collected - paid_out - owed, currency: 'TZS', provider: pv };
};

router.get('/payments/balance', ah(async (req, res) => {
  const l = await ledger();
  const name = (require('../config/provider').PROVIDERS[l.provider] || {}).name || l.provider;
  res.json({ provider: l.provider, provider_name: name, available: { value: l.value, currency: 'TZS' },
    collected: l.collected, paid_out: l.paid_out, commission_owed: l.owed, updated_at: new Date().toISOString(), connected: true });
}));
// Salio halisi la ClickPesa, kwa kulinganisha (si salio la wateja)
router.get('/payments/provider-balance', wrap(async (req, res) => res.json({ provider: 'clickpesa', raw: await cp.balance() })));
router.get('/payments/statement', wrap(async (req, res) => res.json(await cp.statement())));
router.get('/payments/clickpesa', wrap(async (req, res) => res.json(await cp.paymentsAll())));
router.get('/payments/clickpesa-payouts', wrap(async (req, res) => res.json(await cp.payoutsAll())));

router.get('/payments/fees', wrap(async (req, res) => {
  const amount = parseInt(req.query.amount, 10);
  if (!Number.isInteger(amount) || amount < 500) throw httpErr(400, 'Amount si sahihi.');
  const phone = req.query.channel === 'mobile' ? req.query.phone : '';
  res.json(await svc.feeFor(amount, phone));
}));

router.get('/payments/payouts', ah(async (req, res) => {
  const pv = await require('../config/provider').getActive();
  const r = await query('SELECT p.*, u.name AS admin_name FROM payouts p JOIN users u ON u.id=p.admin_user_id WHERE p.provider=$1 ORDER BY p.created_at DESC LIMIT 100', [pv]);
  res.json({ payouts: r.rows });
}));
router.post('/payments/payouts', wrap(async (req, res) => {
  const row = await svc.createPayout(req.user, req.body || {});
  await audit(req, 'payout.create', 'payout', row.id, { amount: row.amount, status: row.status });
  res.status(201).json({ payout: row });
}));
router.get('/payments/payouts/:id', wrap(async (req, res) => res.json({ payout: await svc.sync(parseInt(req.params.id, 10)) })));

module.exports = router;
