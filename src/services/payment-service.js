const crypto = require('crypto');
const { query, tx } = require('../config/database');
const cp = require('../config/clickpesa');
const sp = require('../config/sonicpesa');
const fl = require('../config/fastlipa');
const provider = require('../config/provider');
const subs = require('./subscription-service');
const { normalizePhone, httpErr } = require('../utils/validation');

async function createPayment(user, { packageId, channelId, matchId, appId, phone }) {
  const active = await provider.getActive();
  if (!(await provider.isReady(active))) throw httpErr(503, 'Mfumo wa malipo haujasanidiwa. Wasiliana na msimamizi.');
  let pk;
  if (appId) {
    pk = (await query('SELECT id,price,title FROM app_releases WHERE id=$1 AND price>0', [appId])).rows[0];
    if (!pk) throw httpErr(404, 'App hii haiuzwi kwa sasa.');
  } else if (matchId) {
    pk = (await query("SELECT id,price,home_team,away_team FROM matches WHERE id=$1 AND active AND price>0 AND kickoff_at + interval '150 minutes' > now()", [matchId])).rows[0];
    if (!pk) throw httpErr(404, 'Mechi hii haiuzwi kwa sasa.');
  } else if (channelId) {
    pk = (await query("SELECT id,name,price FROM channels WHERE id=$1 AND active AND access_type='PAID' AND price>0", [channelId])).rows[0];
    if (!pk) throw httpErr(404, 'Channel hii haiuzwi peke yake.');
  } else {
    pk = (await query('SELECT id,name,price FROM packages WHERE id=$1 AND active', [packageId])).rows[0];
    if (!pk) throw httpErr(404, 'Kifurushi hakipatikani.');
  }
  const msisdn = normalizePhone(phone || user.phone);
  if (!msisdn) throw httpErr(400, 'Namba ya simu si sahihi.');
  const orderId = 'ORD' + crypto.randomBytes(8).toString('hex').toUpperCase();
  let providerRef = orderId;

  // FastLipa: transaction/create inarudisha tranID ndicho kitambulisho cha malipo
  if (active === 'fastlipa') {
    try {
      const d = await fl.createTransaction({ number: msisdn, amount: pk.price, reference: orderId, name: user.name.trim(), webhook_url: fl.webhookUrl('/webhooks/fastlipa') });
      providerRef = String(d.tranID);
    } catch (e) {
      console.error('FastLipa: malipo hayakuanzishwa:', e.message);
      throw httpErr(502, 'Malipo hayakuanzishwa: ' + String(e.message).slice(0, 160));
    }
  }

  // SonicPesa: agizo linaundwa kwanza, na order_id yake ndiyo kitambulisho cha malipo
  if (active === 'sonicpesa') {
    const email = `user${user.id}@${process.env.CUSTOMER_EMAIL_DOMAIN || 'example.com'}`;
    try {
      const d = await sp.createOrder({ buyer_email: email, buyer_name: user.name.trim(), buyer_phone: msisdn, amount: pk.price, currency: 'TZS' });
      providerRef = d.order_id;
    } catch (e) {
      console.error('SonicPesa: malipo hayakuanzishwa:', e.message);
      throw httpErr(502, 'Malipo hayakuanzishwa: ' + String(e.message).slice(0, 160));
    }
  }

  const ins = await query(
    `INSERT INTO payments(user_id,package_id,channel_id,match_id,app_release_id,order_id,provider,provider_reference,amount,currency,status,phone)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'TZS','PENDING',$10) RETURNING id`,
    [user.id, (matchId || channelId || appId) ? null : pk.id, channelId ? pk.id : null, matchId ? pk.id : null, appId ? pk.id : null, orderId, active, providerRef, pk.price, msisdn]);
  const paymentId = ins.rows[0].id;

  // ClickPesa: USSD push inatumwa baada ya rekodi kuwekwa
  if (active === 'clickpesa') {
    try { await cp.startUssd({ orderId, amount: pk.price, msisdn }); }
    catch (e) {
      console.error('ClickPesa: malipo hayakuanzishwa:', e.message);
      await query("UPDATE payments SET status='FAILED', failure_reason=$2 WHERE id=$1", [paymentId, String(e.message).slice(0, 300)]);
      throw httpErr(502, 'Malipo hayakuanzishwa: ' + String(e.message).slice(0, 160));
    }
  }
  return { id: paymentId, order_id: orderId, status: 'PENDING', amount: pk.price, message: 'Angalia simu yako na uweke PIN kukamilisha malipo.' };
}

const FINAL = { completed: 'COMPLETED', failed: 'FAILED', voided: 'VOIDED', expired: 'EXPIRED' };

// data = { reference, status, amount:{value,currency}, failure_reason, metadata:{order_id} }
async function applyPaymentUpdate(data) {
  return tx(async (c) => {
    let p = (await c.query('SELECT * FROM payments WHERE provider_reference=$1 FOR UPDATE', [data.reference])).rows[0];
    if (!p && data.metadata && data.metadata.order_id) {
      p = (await c.query('SELECT * FROM payments WHERE order_id=$1 FOR UPDATE', [data.metadata.order_id])).rows[0];
    }
    if (!p) return { matched: false };
    if (p.status === 'COMPLETED' && ['refunded', 'reversed'].includes(String(data.status || '').toLowerCase())) {
      await c.query("UPDATE payments SET status='REFUNDED' WHERE id=$1", [p.id]);
      await require('./promo').reverseForPayment(c, p.id);
      return { matched: true, changed: true };
    }
    if (p.status === 'COMPLETED') return { matched: true, changed: false, payment: p };
    const st = FINAL[String(data.status || '').toLowerCase()];
    if (!st) return { matched: true, changed: false, payment: p };
    if (st === 'COMPLETED') {
      const amt = data.amount && Number(data.amount.value);
      const cur = data.amount && data.amount.currency;
      if (amt !== p.amount || cur !== p.currency) {
        await c.query("UPDATE payments SET status='REVIEW', failure_reason='Kiasi hakilingani na bei' WHERE id=$1", [p.id]);
        await c.query("INSERT INTO audit_logs(action,entity,entity_id,details) VALUES('payment.mismatch','payment',$1,$2)", [String(p.id), { expected: p.amount, got: data.amount }]);
        return { matched: true, changed: true, mismatch: true };
      }
      await c.query("UPDATE payments SET status='COMPLETED', completed_at=now(), failure_reason=NULL WHERE id=$1", [p.id]);
      await subs.activateForPayment(c, p);
      await require('./promo').creditForPayment(c, p);
      return { matched: true, changed: true };
    }
    await c.query('UPDATE payments SET status=$2, failure_reason=$3 WHERE id=$1', [p.id, st, data.failure_reason || null]);
    return { matched: true, changed: true };
  });
}

// Kuangalia hali kwa mtoa huduma (webhook ikichelewa)
async function refreshFromProvider(payment) {
  if (!payment.provider_reference) return payment;
  if (payment.provider === 'fastlipa') {
    const d = await fl.transactionStatus(payment.provider_reference);
    const st = String(d.payment_status || '').toUpperCase();
    const mapped = st === 'COMPLETED' ? 'completed' : ['CANCELLED', 'FAILED', 'REJECTED'].includes(st) ? 'failed' : null;
    if (mapped) await applyPaymentUpdate({ reference: payment.provider_reference, status: mapped, amount: { value: d.amount, currency: 'TZS' }, failure_reason: null, metadata: { order_id: payment.order_id } });
    return (await query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
  }
  if (payment.provider === 'sonicpesa') {
    const d = await sp.orderStatus(payment.provider_reference);
    const st = String(d.payment_status || (d.transaction && d.transaction.status) || '').toUpperCase();
    const mapped = st === 'SUCCESS' ? 'completed' : ['REJECTED', 'CANCELLED', 'USERCANCELLED'].includes(st) ? 'failed' : null;
    if (mapped) await applyPaymentUpdate({ reference: payment.provider_reference, status: mapped, amount: { value: d.amount, currency: d.currency || 'TZS' }, failure_reason: null, metadata: { order_id: payment.order_id } });
  } else {
    const st = await cp.queryStatus(payment.order_id);
    const v = String(st.status || '').toUpperCase();
    const mapped = v === 'SUCCESS' ? 'completed' : v === 'FAILED' ? 'failed' : null;
    if (mapped) await applyPaymentUpdate({ reference: payment.provider_reference, status: mapped, amount: { value: st.collectedAmount ?? st.amount, currency: 'TZS' }, failure_reason: st.message || null, metadata: { order_id: payment.order_id } });
  }
  return (await query('SELECT * FROM payments WHERE id=$1', [payment.id])).rows[0];
}

async function expireStalePending() {
  await query("UPDATE payments SET status='EXPIRED' WHERE status='PENDING' AND created_at < now() - interval '5 hours'");
}

module.exports = { createPayment, applyPaymentUpdate, refreshFromProvider, expireStalePending };
