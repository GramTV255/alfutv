// Promo codes: commission ya 5% kwa miamala 3 ya kwanza ya kila mnunuzi (vifurushi tu)
const crypto = require('crypto');
const { query } = require('../config/database');

const MAX_BUYS = 3, MIN_PAYOUT = 5000;
// Asilimia ya commission inasomwa kutoka kwenye database (admin anaibadilisha)
async function getRatePct() {
  const r = await query('SELECT rate_percent FROM promo_config WHERE id=1');
  const v = Number(r.rows[0] && r.rows[0].rate_percent);
  return Number.isFinite(v) ? v : 5;
}
async function setRatePct(v) {
  await query('INSERT INTO promo_config(id, rate_percent) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET rate_percent=EXCLUDED.rate_percent', [v]);
}
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length]; return s; };

// Inaitwa ndani ya transaction ya malipo yaliyokamilika
async function creditForPayment(c, p) {
  if (!p.package_id || p.channel_id || p.match_id || p.app_release_id) return null;   // vifurushi tu
  const u = (await c.query('SELECT promo_code_id FROM users WHERE id=$1', [p.user_id])).rows[0];
  if (!u || !u.promo_code_id) return null;
  const code = (await c.query('SELECT owner_id, rate_percent FROM promo_codes WHERE id=$1', [u.promo_code_id])).rows[0];
  if (!code || code.owner_id == null || code.owner_id === p.user_id) return null;   // code ya majaribio haina mwenye kamisheni
  const n = (await c.query("SELECT count(*)::int AS n FROM promo_commissions WHERE buyer_id=$1 AND status='CREDITED'", [p.user_id])).rows[0].n;
  if (n >= MAX_BUYS) return null;
  const rate = code.rate_percent != null ? Number(code.rate_percent) : await getRatePct();
  const comm = Math.floor(Number(p.amount) * rate / 100);
  if (comm < 1) return null;
  const r = await c.query(
    "INSERT INTO promo_commissions(code_id,buyer_id,payment_id,gross,commission,status) VALUES($1,$2,$3,$4,$5,'CREDITED') ON CONFLICT (payment_id) DO NOTHING RETURNING id",
    [u.promo_code_id, p.user_id, p.id, p.amount, comm]);
  return r.rows[0] || null;
}

// Malipo yamerudishwa: commission inaondolewa
async function reverseForPayment(c, paymentId) {
  await c.query("UPDATE promo_commissions SET status='REVERSED' WHERE payment_id=$1 AND status='CREDITED'", [paymentId]);
}

async function ownerView(userId) {
  const c = (await query('SELECT * FROM promo_codes WHERE owner_id=$1', [userId])).rows[0];
  if (!c) return null;
  const s = (await query(`SELECT
      (SELECT count(*)::int FROM users WHERE promo_code_id=$1) AS used,
      (SELECT count(DISTINCT buyer_id)::int FROM promo_commissions WHERE code_id=$1 AND status='CREDITED') AS paid_buyers,
      (SELECT count(*)::int FROM promo_commissions WHERE code_id=$1 AND status='CREDITED') AS paid_tx,
      (SELECT COALESCE(sum(commission),0)::bigint FROM promo_commissions WHERE code_id=$1 AND status='CREDITED') AS earned,
      (SELECT COALESCE(sum(amount),0)::bigint FROM promo_payouts WHERE code_id=$1 AND status='PAID') AS paid_out,
      (SELECT COALESCE(sum(amount),0)::bigint FROM promo_payouts WHERE code_id=$1 AND status='PENDING') AS pending`, [c.id])).rows[0];
  const earned = Number(s.earned), paidOut = Number(s.paid_out), pending = Number(s.pending);
  const payouts = (await query('SELECT id,amount,status,created_at,decided_at FROM promo_payouts WHERE code_id=$1 ORDER BY created_at DESC LIMIT 20', [c.id])).rows;
  return {
    code: c.code, active: c.active, expires_at: c.expires_at,
    expired: !c.active || new Date(c.expires_at) <= new Date(),
    used: s.used, paid_buyers: s.paid_buyers, paid_tx: s.paid_tx,
    earned, paid_out: paidOut, pending, balance: earned - paidOut - pending,
    min_payout: MIN_PAYOUT, payouts, id: c.id, rate: c.rate_percent != null ? Number(c.rate_percent) : await getRatePct(),
  };
}

module.exports = { MAX_BUYS, MIN_PAYOUT, getRatePct, setRatePct, genCode, creditForPayment, reverseForPayment, ownerView };
