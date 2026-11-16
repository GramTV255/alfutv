const crypto = require('crypto');
const { query } = require('../config/database');
const cp = require('../config/clickpesa');
const sp = require('../config/sonicpesa');
const fl = require('../config/fastlipa');
const provider = require('../config/provider');
const { normalizePhone, httpErr } = require('../utils/validation');

// Fee kutoka kwenye preview. Haijulikani => 0 + fee_known:false (payout inaendelea, admin anaona "haijulikani")
function clickpesaFee(pv) {
  const v = pv.fee ?? pv.fees ?? pv.fee_amount ?? pv.feeAmount;
  if (v === undefined || v === null) return { fee: 0, known: false, fields: Object.keys(pv) };
  return { fee: Number(v) || 0, known: true, fields: Object.keys(pv) };
}

// FastLipa: mitandao (AirtelMoney, TigoPesa, M-PESA, Halopesa). Fee iko ndani ya kiasi cha jumla (gross).
const FL_NETWORKS = { 'M-PESA': 'M-PESA', 'Tigo Pesa': 'TigoPesa', 'Airtel Money': 'AirtelMoney', 'Halopesa': 'Halopesa' };

async function createFlPayout(adminUser, b) {
  const network = FL_NETWORKS[String(b.method || '')];
  if (!network) throw httpErr(400, 'Chagua mtandao: M-PESA, Tigo Pesa, Airtel Money au Halopesa.');
  const p = normalizePhone(b.recipient);
  if (!p) throw httpErr(400, 'Namba ya simu si sahihi.');
  if (!Number.isInteger(b.amount) || b.amount < 3000) throw httpErr(400, 'FastLipa: kiasi cha chini ni TZS 3,000.');
  const ref = 'FLP' + crypto.randomBytes(10).toString('hex');
  let d;
  try { d = await fl.createPayout({ number: p, amount: b.amount, name: b.recipient_name.trim(), network, reference: ref, webhook_url: fl.webhookUrl('/webhooks/fastlipa') }); }
  catch (e) { throw httpErr(502, 'Payout imeshindikana: ' + String(e.message).slice(0, 160)); }
  const ins = await query(
    `INSERT INTO payouts(admin_user_id,provider,provider_reference,idempotency_key,recipient_name,recipient_phone_or_account,channel,bank_code,amount,fee,currency,status,narration)
     VALUES($1,'fastlipa',$2,$3,$4,$5,'mobile',$6,$7,0,'TZS','PENDING',$8) RETURNING *`,
    [adminUser.id, String(d.tranID), ref, b.recipient_name.trim(), p, b.method, b.amount, (b.narration || '').slice(0, 200) || null]);
  // Fee ya FastLipa imo ndani ya kiasi (gross): tunaiweka kwenye audit ili isihesabiwe mara mbili kwenye salio
  await query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'payout.fastlipa_fee','payout',$2,$3)", [adminUser.id, ins.rows[0].id, { fee: d.fee ?? null, deposit: d.deposit ?? null }]);
  return ins.rows[0];
}

// SonicPesa: njia zinazoruhusiwa (kulingana na nyaraka). Mobile au benki.
const SP_METHODS = { 'M-Pesa': 'mobile', 'Tigo Pesa': 'mobile', 'Airtel Money': 'mobile', 'Halopesa': 'mobile', 'CRDB Bank': 'bank', 'NMB Bank': 'bank', 'Selcom': 'bank' };

async function createSonicPayout(adminUser, b) {
  const method = String(b.method || '');
  if (!SP_METHODS[method]) throw httpErr(400, 'Chagua njia ya malipo: ' + Object.keys(SP_METHODS).join(', ') + '.');
  const channel = SP_METHODS[method];
  let acct = String(b.recipient || '').replace(/[\s-]/g, '');
  if (channel === 'mobile') {
    const p = normalizePhone(acct);
    if (!p) throw httpErr(400, 'Namba ya simu si sahihi.');
    acct = p.slice(-9);                       // 7XXXXXXXX
  } else if (!/^\d{5,20}$/.test(acct)) throw httpErr(400, 'Namba ya akaunti si sahihi.');
  let d;
  try { d = await sp.createPayout({ amount: b.amount, method, account_number: acct, account_name: b.recipient_name.trim() }); }
  catch (e) { throw httpErr(502, 'Payout imeshindikana: ' + String(e.message).slice(0, 160)); }
  const ref = String(d.withdrawal_id);
  const st = String(d.status || 'pending').toLowerCase() === 'completed' ? 'COMPLETED' : 'PENDING';
  const ins = await query(
    `INSERT INTO payouts(admin_user_id,provider,provider_reference,idempotency_key,recipient_name,recipient_phone_or_account,channel,bank_code,amount,fee,currency,status,narration)
     VALUES($1,'sonicpesa',$2,$3,$4,$5,$6,$7,$8,$9,'TZS',$10,$11) RETURNING *`,
    // SonicPesa haina makato: fee ni sifuri kila wakati
    [adminUser.id, ref, 'SP' + ref + '-' + Date.now(), b.recipient_name.trim(), acct, channel, method, b.amount, 0, st, (b.narration || '').slice(0, 200) || null]);
  return ins.rows[0];
}

async function feeFor(amount, phone) {
  if ((await provider.getActive()) === 'fastlipa') return { amount, fee: 0, fee_known: false, total: amount, currency: 'TZS', provider: 'fastlipa' };
  if ((await provider.getActive()) === 'sonicpesa') return { amount, fee: 0, fee_known: true, total: amount, currency: 'TZS', provider: 'sonicpesa' };   // hakuna makato
  const p = normalizePhone(phone);
  if (!p) return { amount, fee: 0, fee_known: false, total: amount, currency: 'TZS', provider: 'clickpesa' };
  const pv = await cp.previewMobilePayout({ amount: String(amount), currency: 'TZS', orderReference: 'PV' + crypto.randomBytes(8).toString('hex'), phoneNumber: p });
  const fz = clickpesaFee(pv);
  return { amount, fee: fz.fee, fee_known: fz.known, total: amount + fz.fee, currency: 'TZS', provider: 'clickpesa' };
}

async function createPayout(adminUser, b) {
  if ((await provider.getActive()) === 'fastlipa') {
    if (b.confirm !== true) throw httpErr(400, 'Thibitisha payout kwanza.');
    if (typeof b.recipient_name !== 'string' || b.recipient_name.trim().length < 2) throw httpErr(400, 'Jina la mpokeaji linahitajika.');
    return createFlPayout(adminUser, b);
  }
  if ((await provider.getActive()) === 'sonicpesa') {
    if (b.confirm !== true) throw httpErr(400, 'Thibitisha payout kwanza.');
    if (!Number.isInteger(b.amount) || b.amount < 500) throw httpErr(400, 'Amount si sahihi (angalau 500).');
    if (typeof b.recipient_name !== 'string' || b.recipient_name.trim().length < 2) throw httpErr(400, 'Jina la mpokeaji linahitajika.');
    return createSonicPayout(adminUser, b);
  }
  if (b.confirm !== true) throw httpErr(400, 'Thibitisha payout kwanza.');
  if (!Number.isInteger(b.amount) || b.amount < 500) throw httpErr(400, 'Amount si sahihi (angalau 500).');
  if (typeof b.recipient_name !== 'string' || b.recipient_name.trim().length < 2) throw httpErr(400, 'Jina la mpokeaji linahitajika.');
  if (b.channel !== 'mobile') throw httpErr(400, 'Kwa sasa payout ni Mobile Money pekee.');
  const target = normalizePhone(b.recipient);
  if (!target) throw httpErr(400, 'Namba ya simu si sahihi.');

  const key = 'PO' + crypto.randomBytes(12).toString('hex');
  const body = { amount: String(b.amount), currency: 'TZS', orderReference: key, phoneNumber: target };
  const pv = await cp.previewMobilePayout(body);
  const fz = clickpesaFee(pv);
  const ins = await query(
    `INSERT INTO payouts(admin_user_id,provider,provider_reference,idempotency_key,recipient_name,recipient_phone_or_account,channel,bank_code,amount,fee,currency,status,narration)
     VALUES($1,'clickpesa',$2,$2,$3,$4,'mobile',NULL,$5,$6,'TZS','PROCESSING',$7) RETURNING id`,
    [adminUser.id, key, b.recipient_name.trim(), target, b.amount, fz.fee, (b.narration || '').slice(0, 200) || null]);
  const id = ins.rows[0].id;
  if (!fz.known) await query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'payout.fee_unknown','payout',$2,$3)", [adminUser.id, key, { fields: fz.fields, preview: pv }]);
  try { await cp.createMobilePayout(body); }
  catch (e) {
    await query("UPDATE payouts SET status='FAILED', failure_reason=$2 WHERE id=$1", [id, String(e.message).slice(0, 300)]);
    throw httpErr(502, 'Payout imeshindikana: ' + String(e.message).slice(0, 160));
  }
  return (await query('SELECT * FROM payouts WHERE id=$1', [id])).rows[0];
}

// Hali ya payout kutoka ClickPesa
async function sync(id) {
  const row = (await query('SELECT * FROM payouts WHERE id=$1', [id])).rows[0];
  if (!row) throw httpErr(404, 'Payout haipatikani.');
  if (row.provider === 'fastlipa') {
    const d = await fl.payoutStatus(row.provider_reference);
    const v = String(d.status || '').toLowerCase();
    const st = v === 'completed' ? 'COMPLETED' : v === 'failed' ? 'FAILED' : 'PENDING';
    await query(`UPDATE payouts SET status=$2, failure_reason=$3, completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE id=$1`, [id, st, st === 'FAILED' ? (d.reason || d.message || null) : null]);
    return (await query('SELECT * FROM payouts WHERE id=$1', [id])).rows[0];
  }
  if (row.provider === 'sonicpesa') {
    const d = await sp.payoutStatus(row.provider_reference);
    const v = String(d.status || '').toLowerCase();
    const st = v === 'completed' ? 'COMPLETED' : v === 'failed' ? 'FAILED' : v === 'rejected' || v === 'cancelled' ? 'REJECTED' : 'PENDING';
    await query(`UPDATE payouts SET status=$2, failure_reason=$3, completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE id=$1`, [id, st, st === 'FAILED' ? (d.message || null) : null]);
    return (await query('SELECT * FROM payouts WHERE id=$1', [id])).rows[0];
  }
  if (!row.provider_reference) return row;
  const j = await cp.payoutStatus(row.provider_reference);
  const v = String(j.status || '').toUpperCase();
  const st = v === 'SUCCESS' ? 'COMPLETED' : v === 'FAILED' ? 'FAILED' : v === 'REJECTED' || v === 'CANCELLED' ? 'REJECTED' : v === 'REVERSED' ? 'REVERSED' : 'PROCESSING';
  await query(`UPDATE payouts SET status=$2, failure_reason=$3, completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE id=$1`,
    [id, st, st === 'FAILED' ? (j.message || null) : null]);
  return (await query('SELECT * FROM payouts WHERE id=$1', [id])).rows[0];
}

// Kagua payouts zilizo wazi (zinazoendelea) kwa mtoa huduma; inaitwa kila dakika 5
async function syncOpen() {
  const r = await query(`SELECT id FROM payouts WHERE status IN ('PENDING','PROCESSING','PENDING_VERIFY') AND provider_reference IS NOT NULL
    AND created_at > now() - interval '3 days' ORDER BY created_at LIMIT 40`);
  for (const row of r.rows) {
    try { await sync(row.id); } catch (e) { console.error('payout sync', row.id, e.message); }
  }
}

module.exports = { clickpesaFee, feeFor, createPayout, sync, syncOpen };
