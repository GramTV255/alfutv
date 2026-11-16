// Promo codes: mwenye code (me) na admin
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { normalizePhone, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const promo = require('../services/promo');
const smsVerify = require('../services/sms-verify');

const pub = express.Router();
const adm = express.Router();
const id_ = (v) => parseInt(v, 10) || 0;
// Asilimia maalum ya code: null/'' = tumia ya jumla; vinginevyo 0 hadi 50
const parseRate = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 50) throw httpErr(400, 'Asilimia ya code iwe kati ya 0 na 50.');
  return Math.round(n * 100) / 100;
};

// ---------- ukaguzi wa code kwa link ya kujisajili (public, bila kutoa taarifa za mwenye code) ----------
const checkLimit = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
pub.get('/check', checkLimit, ah(async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.json({ valid: false, message: 'Weka promo code.' });
  const r = (await query('SELECT active, expires_at FROM promo_codes WHERE code=$1', [code])).rows[0];
  const ok = !!r && r.active && new Date(r.expires_at) > new Date();
  res.json({ valid: ok, message: ok ? 'Promo code imekubaliwa.' : 'Promo code si sahihi au imeisha.' });
}));

// ---------- mwenye code ----------
pub.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ promo: await promo.ownerView(req.user.id) });
}));

pub.post('/payouts', requireAuth, ah(async (req, res) => {
  const amount = parseInt((req.body || {}).amount, 10);
  const v = await promo.ownerView(req.user.id);
  if (!v) throw httpErr(404, 'Huna promo code.');
  if (!Number.isInteger(amount) || amount < promo.MIN_PAYOUT) throw httpErr(400, 'Kiasi cha chini cha payout ni TZS ' + promo.MIN_PAYOUT.toLocaleString('en-US') + '.');
  if (amount > v.balance) throw httpErr(400, 'Salio halitoshi. Salio lako ni TZS ' + Math.floor(v.balance).toLocaleString('en-US') + '.');
  if (v.pending > 0) throw httpErr(400, 'Una ombi lingine linalosubiri. Subiri liidhinishwe kwanza.');
  await query("INSERT INTO promo_payouts(code_id,amount,status) VALUES($1,$2,'PENDING')", [v.id, amount]);
  res.status(201).json({ ok: true });
}));

// ---------- admin ----------
adm.get('/', ah(async (req, res) => {
  const r = await query(`SELECT c.id, c.code, c.active, c.expires_at, c.created_at, c.rate_percent, c.kind, u.id AS user_id, u.name, u.phone,
      (SELECT count(*)::int FROM users x WHERE x.promo_code_id=c.id) AS used,
      (SELECT count(DISTINCT buyer_id)::int FROM promo_commissions m WHERE m.code_id=c.id AND m.status='CREDITED') AS paid_buyers,
      (SELECT COALESCE(sum(commission),0)::bigint FROM promo_commissions m WHERE m.code_id=c.id AND m.status='CREDITED') AS earned,
      (SELECT COALESCE(sum(amount),0)::bigint FROM promo_payouts q WHERE q.code_id=c.id AND q.status='PAID') AS paid_out,
      (SELECT COALESCE(sum(amount),0)::bigint FROM promo_payouts q WHERE q.code_id=c.id AND q.status='PENDING') AS pending
    FROM promo_codes c LEFT JOIN users u ON u.id=c.owner_id ORDER BY c.created_at DESC`);
  const gRate = await promo.getRatePct();
  res.json({ codes: r.rows.map((x) => ({ ...x, rate_effective: x.rate_percent != null ? Number(x.rate_percent) : gRate, balance: Number(x.earned) - Number(x.paid_out) - Number(x.pending), expired: !x.active || new Date(x.expires_at) <= new Date() })) });
}));

adm.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const trial = b.kind === 'TRIAL';
  let owner = null;
  if (!trial) {
    const phone = normalizePhone(b.phone);
    if (!phone) throw httpErr(400, 'Namba ya simu si sahihi.');
    const u = (await query("SELECT u.id, u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.phone=$1 AND r.name='user'", [phone])).rows[0];
    if (!u) throw httpErr(404, 'Hakuna mtumiaji mwenye namba hii.');
    if ((await query('SELECT 1 FROM promo_codes WHERE owner_id=$1', [u.id])).rowCount) throw httpErr(409, 'Mtu huyu tayari ana promo code.');
    owner = u;
  }
  const exp = new Date(b.expires_at);
  if (isNaN(exp.getTime()) || exp <= new Date()) throw httpErr(400, 'Weka tarehe ya kuisha iliyo mbele ya leo.');
  const rate = trial ? null : parseRate(b.rate_percent);
  let code = String(b.code || '').trim().toUpperCase();
  if (code && !/^[A-Z0-9]{4,20}$/.test(code)) throw httpErr(400, 'Code iwe herufi/namba 4 hadi 20.');
  if (code && (await query('SELECT 1 FROM promo_codes WHERE code=$1', [code])).rowCount) throw httpErr(409, 'Code hii tayari ipo.');
  let row = null;
  for (let i = 0; i < 6 && !row; i++) {
    const c = code || promo.genCode();
    try {
      row = (await query('INSERT INTO promo_codes(owner_id,code,expires_at,rate_percent,kind) VALUES($1,$2,$3,$4,$5) RETURNING id,code',
        [owner ? owner.id : null, c, exp.toISOString(), rate, trial ? 'TRIAL' : 'COMMISSION'])).rows[0];
    } catch (e) { if (e.code !== '23505' || code) throw e; }
  }
  if (!row) throw httpErr(500, 'Imeshindikana kutengeneza code. Jaribu tena.');
  await audit(req, 'promo.create', 'promo_code', row.id, { owner: owner && owner.id, code: row.code, kind: trial ? 'TRIAL' : 'COMMISSION' });
  res.status(201).json({ id: row.id, code: row.code, owner: owner ? owner.name : 'Majaribio' });
}));

// Hariri code: jina, asilimia (NULL = ya jumla), tarehe ya kuisha, na hali. Admin pekee.
adm.patch('/:id', ah(async (req, res) => {
  const id = id_(req.params.id), b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!(await query('SELECT 1 FROM promo_codes WHERE id=$1', [id])).rowCount) throw httpErr(404, 'Code haipo.');
  let code = null;
  if (has('code')) {
    code = String(b.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw httpErr(400, 'Code iwe herufi/namba 4 hadi 20.');
    if ((await query('SELECT 1 FROM promo_codes WHERE code=$1 AND id<>$2', [code, id])).rowCount) throw httpErr(409, 'Code hii tayari ipo.');
  }
  let rate = null;
  const setRate = has('rate_percent');
  if (setRate && b.rate_percent !== null && b.rate_percent !== '') {
    const v = Number(b.rate_percent);
    if (!Number.isFinite(v) || v < 0 || v > 50) throw httpErr(400, 'Asilimia ya code iwe kati ya 0 na 50.');
    rate = Math.round(v * 100) / 100;
  }
  let exp = null;
  if (has('expires_at') && b.expires_at) { exp = new Date(b.expires_at); if (isNaN(exp.getTime())) throw httpErr(400, 'Tarehe si sahihi.'); }
  await query(`UPDATE promo_codes SET code=COALESCE($2,code), rate_percent=CASE WHEN $3 THEN $4 ELSE rate_percent END,
      expires_at=COALESCE($5,expires_at), active=COALESCE($6,active) WHERE id=$1`,
    [id, code, setRate, rate, exp ? exp.toISOString() : null, typeof b.active === 'boolean' ? b.active : null]);
  await audit(req, 'promo.update', 'promo_code', id, { code, rate_percent: setRate ? rate : undefined, expires_at: b.expires_at || null, active: b.active });
  res.json({ ok: true });
}));

// Futa kabisa code: wateja wake wanaondolewa kwenye code, historia ya commission na maombi ya payout inafutwa
adm.delete('/:id', ah(async (req, res) => {
  const id = id_(req.params.id);
  const c = (await query('SELECT code FROM promo_codes WHERE id=$1', [id])).rows[0];
  if (!c) throw httpErr(404, 'Code haipo.');
  // Kiasi ambacho bado hakijalipwa kwa mwenye code: kinarudi kwenye salio la mfumo
  const u = (await query(`SELECT
      (SELECT COALESCE(SUM(commission),0)::bigint FROM promo_commissions WHERE code_id=$1 AND status='CREDITED')
      - (SELECT COALESCE(SUM(amount),0)::bigint FROM promo_payouts WHERE code_id=$1 AND status='PAID') AS unpaid`, [id])).rows[0];
  const unpaid = Math.max(0, Number(u.unpaid) || 0);
  await query('UPDATE users SET promo_code_id=NULL WHERE promo_code_id=$1', [id]);
  await query('DELETE FROM promo_codes WHERE id=$1', [id]);
  await audit(req, 'promo.delete', 'promo_code', id, { code: c.code, returned_to_system: unpaid });
  res.json({ ok: true, returned: unpaid });
}));

// Asilimia ya jumla ya commission (admin)
adm.get('/config', ah(async (req, res) => {
  res.json({ rate_percent: await promo.getRatePct() });
}));
adm.put('/config', ah(async (req, res) => {
  const v = Number((req.body || {}).rate_percent);
  if (!Number.isFinite(v) || v < 0 || v > 50) throw httpErr(400, 'Asilimia iwe kati ya 0 na 50.');
  const val = Math.round(v * 100) / 100;
  await promo.setRatePct(val);
  await audit(req, 'promo.rate', 'promo_config', 1, { rate_percent: val });
  res.json({ rate_percent: val });
}));

adm.get('/payouts', ah(async (req, res) => {
  const r = await query(`SELECT q.id, q.amount, q.status, q.created_at, q.decided_at, q.note, c.code, u.name, u.phone
    FROM promo_payouts q JOIN promo_codes c ON c.id=q.code_id JOIN users u ON u.id=c.owner_id ORDER BY q.created_at DESC LIMIT 200`);
  res.json({ payouts: r.rows });
}));

// Payout ya mkono: admin anatuma pesa kutoka simu yake, kisha anabandika SMS ya muamala.
// Mfumo unakagua kiasi, namba ya mwenye code, na namba ya muamala (haitumiki mara mbili).
adm.post('/payouts/:id/confirm', ah(async (req, res) => {
  const sms = String((req.body || {}).sms || '').trim();
  if (sms.length < 20) throw httpErr(400, 'Bandika SMS nzima ya muamala.');
  const q = (await query(`SELECT q.id, q.amount, q.status, u.phone FROM promo_payouts q
      JOIN promo_codes c ON c.id=q.code_id JOIN users u ON u.id=c.owner_id WHERE q.id=$1`, [id_(req.params.id)])).rows[0];
  if (!q) throw httpErr(404, 'Ombi haipo.');
  if (q.status !== 'PENDING') throw httpErr(400, 'Ombi hili tayari limeshughulikiwa.');
  const v = smsVerify.verify(sms, { amount: q.amount, phone: q.phone });
  if (!v.ok) throw httpErr(400, v.errors.join(' • '));
  try {
    await query("UPDATE promo_payouts SET status='PAID', decided_at=now(), tx_ref=$2, note=$3 WHERE id=$1 AND status='PENDING'",
      [q.id, v.tx, 'Malipo ya mkono • ' + v.tx]);
  } catch (e) {
    if (e.code === '23505') throw httpErr(409, 'Namba hii ya muamala imeshatumika kwenye malipo mengine.');
    throw e;
  }
  await audit(req, 'promo.payout_confirm', 'promo_payout', q.id, { amount: q.amount, tx: v.tx });
  res.json({ ok: true });
}));

adm.post('/payouts/:id/reject', ah(async (req, res) => {
  const r = await query("UPDATE promo_payouts SET status='REJECTED', decided_at=now(), note=$2 WHERE id=$1 AND status='PENDING' RETURNING id",
    [id_(req.params.id), String((req.body || {}).reason || 'Imekataliwa').slice(0, 200)]);
  if (!r.rowCount) throw httpErr(400, 'Ombi haliwezi kukataliwa.');
  await audit(req, 'promo.payout_reject', 'promo_payout', id_(req.params.id), {});
  res.json({ ok: true });
}));

module.exports = { pub, adm };
