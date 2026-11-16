const crypto = require('crypto');
const { query } = require('../config/database');
const cp = require('../config/clickpesa');
const pay = require('./payment-service');

// ClickPesa: webhook yenye checksum. Bila checksum key, haikubali kabisa.
async function handleClickpesa(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) return res.status(400).json({ error: 'bad body' });
  const c = await cp.getCreds();
  if (!c.checksumKey) return res.status(503).json({ error: 'not configured' });
  if (!cp.verifyWebhook(body, c.checksumKey)) return res.status(400).json({ error: 'invalid checksum' });
  const ev = String(body.event || body.eventType || '').toUpperCase();
  const data = body.data && typeof body.data === 'object' ? body.data : body;
  const order = data.orderReference;
  if (!order) return res.status(400).json({ error: 'bad event' });
  const eventId = 'clickpesa:' + crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const ins = await query(
    `INSERT INTO webhook_events(event_id,event_type,processing_status) VALUES($1,$2,'RECEIVED')
     ON CONFLICT (event_id) DO UPDATE SET processing_status='RECEIVED', error=NULL
     WHERE webhook_events.processing_status='FAILED' RETURNING event_id`, [eventId, ev || 'CLICKPESA']);
  if (!ins.rowCount) return res.status(200).json({ ok: true, duplicate: true });
  try {
    const st = String(data.status || '').toUpperCase();
    if (ev.startsWith('PAYOUT')) {
      const st2 = ev.includes('REVERSED') ? 'REVERSED' : ev.includes('REFUNDED') ? 'REFUNDED' : st === 'SUCCESS' ? 'COMPLETED' : st === 'FAILED' ? 'FAILED' : st === 'REJECTED' || st === 'CANCELLED' ? 'REJECTED' : 'PROCESSING';
      await query(`UPDATE payouts SET status=$2, failure_reason=$3, completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE provider='clickpesa' AND provider_reference=$1`,
        [order, st2, st2 === 'FAILED' ? (data.message || null) : null]);
    }
    if (ev === 'PAYMENT RECEIVED' || ev === 'PAYMENT FAILED') {
      const mapped = ev === 'PAYMENT RECEIVED' && st === 'SUCCESS' ? 'completed' : ev === 'PAYMENT FAILED' ? 'failed' : null;
      if (mapped) await pay.applyPaymentUpdate({ reference: order, status: mapped, amount: { value: data.collectedAmount, currency: 'TZS' }, failure_reason: mapped === 'failed' ? (data.message || null) : null, metadata: { order_id: order } });
    }
    await query("UPDATE webhook_events SET processing_status='PROCESSED', processed_at=now() WHERE event_id=$1", [eventId]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('ClickPesa webhook error:', e.message);
    await query("UPDATE webhook_events SET processing_status='FAILED', error=$2 WHERE event_id=$1", [eventId, e.message.slice(0, 300)]);
    return res.status(500).json({ error: 'processing failed' });
  }
}

// SonicPesa: saini ya HMAC-SHA256 ya raw body kwa API Secret (header X-SonicPesa-Signature)
async function handleSonic(req, res) {
  const sp = require('../config/sonicpesa');
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) return res.status(400).json({ error: 'bad body' });
  const c = await sp.getCreds();
  if (!c.apiSecret) return res.status(503).json({ error: 'not configured' });
  if (!sp.verifyWebhook(raw, req.headers['x-sonicpesa-signature'], c.apiSecret)) return res.status(400).json({ error: 'invalid signature' });
  let ev;
  try { ev = JSON.parse(raw.toString('utf8')); } catch (_) { return res.status(400).json({ error: 'bad json' }); }
  const event = String(ev.event || '').toLowerCase();
  const d = ev.data && typeof ev.data === 'object' ? ev.data : ev;
  const eventId = 'sonicpesa:' + crypto.createHash('sha256').update(raw).digest('hex');
  const ins = await query(
    `INSERT INTO webhook_events(event_id,event_type,processing_status) VALUES($1,$2,'RECEIVED')
     ON CONFLICT (event_id) DO UPDATE SET processing_status='RECEIVED', error=NULL
     WHERE webhook_events.processing_status='FAILED' RETURNING event_id`, [eventId, event || 'SONICPESA']);
  if (!ins.rowCount) return res.status(200).json({ ok: true, duplicate: true });
  try {
    if (event === 'payment.success' && d.order_id) {
      await pay.applyPaymentUpdate({ reference: d.order_id, status: 'completed', amount: { value: Number(d.amount), currency: d.currency || 'TZS' }, metadata: { order_id: d.order_id } });
    } else if (event.startsWith('payout.') && d.withdrawal_id != null) {
      const st = event === 'payout.success' ? 'COMPLETED' : event === 'payout.failed' ? 'FAILED' : event === 'payout.rejected' ? 'REJECTED' : 'PENDING';
      await query(`UPDATE payouts SET status=$2, failure_reason=$3, completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE provider='sonicpesa' AND provider_reference=$1`,
        [String(d.withdrawal_id), st, st === 'FAILED' ? (d.message || null) : null]);
    }
    await query("UPDATE webhook_events SET processing_status='PROCESSED', processed_at=now() WHERE event_id=$1", [eventId]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('SonicPesa webhook error:', e.message);
    await query("UPDATE webhook_events SET processing_status='FAILED', error=$2 WHERE event_id=$1", [eventId, e.message.slice(0, 300)]);
    return res.status(500).json({ error: 'processing failed' });
  }
}

// FastLipa: saini X-FastLipa-Signature: sha256=<hex> (HMAC-SHA256 ya raw body)
async function handleFastlipa(req, res) {
  const fl = require('../config/fastlipa');
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) return res.status(400).json({ error: 'bad body' });
  const c = await fl.getCreds();
  if (!c.signing) return res.status(503).json({ error: 'not configured' });
  if (!fl.verifyWebhook(raw, req.headers['x-fastlipa-signature'], c.signing)) return res.status(400).json({ error: 'invalid signature' });
  let ev;
  try { ev = JSON.parse(raw.toString('utf8')); } catch (_) { return res.status(400).json({ error: 'bad json' }); }
  const event = String(ev.event || '').toLowerCase();
  const d = ev.data && typeof ev.data === 'object' ? ev.data : {};
  const tranid = d.tranid != null ? String(d.tranid) : '';
  if (!tranid) return res.status(400).json({ error: 'no tranid' });
  const eventId = 'fastlipa:' + event + ':' + tranid;
  const ins = await query(
    `INSERT INTO webhook_events(event_id,event_type,processing_status) VALUES($1,$2,'RECEIVED')
     ON CONFLICT (event_id) DO UPDATE SET processing_status='RECEIVED', error=NULL
     WHERE webhook_events.processing_status='FAILED' RETURNING event_id`, [eventId, event || 'FASTLIPA']);
  if (!ins.rowCount) return res.status(200).json({ ok: true, duplicate: true });
  try {
    const amount = { value: Number(d.amount), currency: 'TZS' };
    if (event === 'payment.completed') {
      await pay.applyPaymentUpdate({ reference: tranid, status: 'completed', amount, metadata: {} });
    } else if (event === 'payment.cancelled') {
      await pay.applyPaymentUpdate({ reference: tranid, status: 'failed', amount, failure_reason: 'Malipo yamefutwa', metadata: {} });
    } else if (event === 'disburse.completed' || event === 'disburse.failed') {
      const st = event === 'disburse.completed' ? 'COMPLETED' : 'FAILED';
      await query(`UPDATE payouts SET status=$2, failure_reason=$3, completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE provider='fastlipa' AND provider_reference=$1`,
        [tranid, st, st === 'FAILED' ? (d.reason || null) : null]);
    }
    await query("UPDATE webhook_events SET processing_status='PROCESSED', processed_at=now() WHERE event_id=$1", [eventId]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('FastLipa webhook error:', e.message);
    await query("UPDATE webhook_events SET processing_status='FAILED', error=$2 WHERE event_id=$1", [eventId, e.message.slice(0, 300)]);
    return res.status(500).json({ error: 'processing failed' });
  }
}

module.exports = { handleClickpesa, handleSonic, handleFastlipa };
