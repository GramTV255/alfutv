'use strict';
const crypto = require('crypto');
const { query, tx } = require('../database/pool');
const clickpesa = require('./clickpesaService');
const { activateSubscription } = require('./subscriptionService');
const { getSetting } = require('./settingsService');
const { HttpError } = require('../utils/errors');
const logger = require('../utils/logger');

// ClickPesa orderReference: alphanumeric, max 20 chars. "CH" + 18 hex chars = 20.
const newOrderReference = () => 'CH' + crypto.randomBytes(9).toString('hex').toUpperCase();

const SUCCESS_STATES = new Set(['SUCCESS', 'SETTLED']);
const FAILED_STATES = new Set(['FAILED', 'REFUNDED', 'REVERSED']);

function mapProviderStatus(s) {
  if (SUCCESS_STATES.has(s)) return 'SUCCESS';
  if (FAILED_STATES.has(s)) return 'FAILED';
  return 'PROCESSING'; // PROCESSING, PENDING, ON-HOLD, unknown
}

async function initiatePayment({ user, packageId, phone }) {
  const pkg = (await query(`SELECT id, name, price FROM packages WHERE id=$1 AND status='ACTIVE'`, [packageId])).rows[0];
  if (!pkg) throw new HttpError(404, 'Kifurushi hakipatikani au kimezimwa', 'PACKAGE_NOT_FOUND');

  // Don't stack requests: reuse a very recent unfinished payment for the same package.
  const recent = (
    await query(
      `SELECT transaction_id, payment_status FROM payments
        WHERE user_id=$1 AND package_id=$2 AND payment_status IN ('PENDING','PROCESSING') AND created_at > now() - interval '90 seconds'
        ORDER BY created_at DESC LIMIT 1`,
      [user.id, pkg.id]
    )
  ).rows[0];
  if (recent) {
    return { transaction_id: recent.transaction_id, status: recent.payment_status, message: 'Tayari una ombi la malipo linaloendelea. Angalia simu yako.', reused: true };
  }

  const ref = newOrderReference();
  const amount = Number(pkg.price);
  // Record first, so a fast webhook always finds the row.
  await query(
    `INSERT INTO payments (user_id, package_id, transaction_id, amount, currency, payment_phone, payment_status)
     VALUES ($1,$2,$3,$4,'TZS',$5,'PENDING')`,
    [user.id, pkg.id, ref, amount, phone]
  );

  const fail = async (msg, status = 502) => {
    await query(`UPDATE payments SET payment_status='FAILED', failure_message=$2 WHERE transaction_id=$1 AND payment_status<>'SUCCESS'`, [ref, String(msg).slice(0, 250)]);
    throw new HttpError(status, msg, 'PAYMENT_INIT_FAILED');
  };

  const fields = { amount, orderReference: ref, phoneNumber: phone };
  const prev = await clickpesa.previewUssdPush(fields).catch((e) => fail(e.message, e.status || 502));
  if (prev.status !== 200) return fail((prev.data && prev.data.message) || 'Uthibitishaji wa awali wa malipo umeshindwa', prev.status === 400 ? 400 : 502);

  const init = await clickpesa.initiateUssdPush(fields).catch((e) => fail(e.message, e.status || 502));
  if (init.status !== 200 || !init.data) return fail((init.data && init.data.message) || 'Ombi la malipo limeshindwa', init.status === 400 ? 400 : 502);

  await query(
    `UPDATE payments SET provider_reference=$2, provider_status=$3,
            payment_status = CASE WHEN payment_status='PENDING' THEN 'PROCESSING' ELSE payment_status END
      WHERE transaction_id=$1`,
    [ref, init.data.id || null, init.data.status || null]
  );
  return { transaction_id: ref, status: 'PROCESSING', message: 'Ombi limetumwa kwenye simu yako. Weka PIN ili kukamilisha malipo.' };
}

// Applies ClickPesa's answer for one order. Idempotent: a payment is counted (and a subscription granted) at most once.
async function applyProviderResult(orderRef, attempts) {
  if (!attempts.length) return { changed: false, status: 'UNKNOWN' };
  const ok = attempts.find((a) => SUCCESS_STATES.has(a.status));
  const chosen = ok || attempts.find((a) => a.status === 'PROCESSING' || a.status === 'PENDING') || attempts[attempts.length - 1];
  const mapped = mapProviderStatus(chosen.status);
  const acceptNet = (await getSetting('clickpesa_accept_net_amount')) === '1';

  return tx(async (c) => {
    const p = (await c.query('SELECT * FROM payments WHERE transaction_id=$1 FOR UPDATE', [orderRef])).rows[0];
    if (!p) return { changed: false, status: 'NOT_OURS' };
    if (p.payment_status === 'SUCCESS') return { changed: false, status: 'SUCCESS', duplicate: true }; // already counted

    if (mapped === 'SUCCESS') {
      const collected = Number(chosen.collectedAmount);
      const cur = chosen.collectedCurrency;
      const expected = Number(p.amount);
      const currencyOk = !cur || cur === p.currency;
      const amountOk = Number.isFinite(collected) && (collected >= expected || (acceptNet && collected > 0));
      if (!currencyOk || !amountOk) {
        await c.query(
          `UPDATE payments SET payment_status='PROCESSING', provider_status=$2, failure_message=$3 WHERE id=$1`,
          [p.id, chosen.status, `AMOUNT_MISMATCH: expected ${expected} ${p.currency}, got ${chosen.collectedAmount} ${cur}`]
        );
        logger.warn('Payment amount mismatch - not activated', { orderRef });
        return { changed: false, status: 'MISMATCH' };
      }
      const act = await activateSubscription(c, { userId: p.user_id, packageId: p.package_id, paymentId: p.id });
      await c.query(
        `UPDATE payments SET payment_status='SUCCESS', provider_status=$2, provider_reference=COALESCE($3, provider_reference),
                confirmed_at=now(), subscription_id=$4, failure_message=NULL WHERE id=$1`,
        [p.id, chosen.status, chosen.id || chosen.paymentReference || null, act.subscription.id]
      );
      return { changed: true, status: 'SUCCESS' };
    }

    if (mapped === 'FAILED') {
      await c.query(`UPDATE payments SET payment_status='FAILED', provider_status=$2, failure_message=$3 WHERE id=$1`, [
        p.id, chosen.status, String(chosen.message || 'Malipo yameshindwa').slice(0, 250),
      ]);
      return { changed: true, status: 'FAILED' };
    }

    await c.query(`UPDATE payments SET payment_status='PROCESSING', provider_status=$2 WHERE id=$1 AND payment_status='PENDING'`, [p.id, chosen.status]);
    return { changed: false, status: 'PROCESSING' };
  });
}

// Official verification: ask ClickPesa for the real status of this order (never trust the browser or a bare webhook body).
async function verifyPayment(orderRef) {
  const r = await clickpesa.queryPayment(orderRef);
  if (r.status === 404) return { changed: false, status: 'NOT_FOUND_AT_PROVIDER' };
  if (r.status !== 200) throw new HttpError(502, 'Imeshindwa kuthibitisha malipo kwa ClickPesa', 'VERIFY_FAILED');
  return applyProviderResult(orderRef, r.attempts);
}

async function handleWebhook(payload) {
  const { checksumKey } = await clickpesa.getCredentials();
  let verified = false;
  if (checksumKey) {
    verified = clickpesa.verifyChecksum(checksumKey, payload, payload && payload.checksum);
    if (!verified) {
      await logWebhook(payload, false, 'BAD_CHECKSUM');
      throw new HttpError(401, 'Invalid checksum', 'BAD_CHECKSUM');
    }
  }
  const event = payload && payload.event;
  const orderRef = payload && payload.data && payload.data.orderReference;
  if (!orderRef || typeof orderRef !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(orderRef)) {
    await logWebhook(payload, verified, 'IGNORED_NO_ORDER');
    return { ok: true };
  }
  if (event !== 'PAYMENT RECEIVED' && event !== 'PAYMENT FAILED') {
    await logWebhook(payload, verified, 'IGNORED_EVENT');
    return { ok: true };
  }
  let outcome;
  try {
    // The webhook body is only a hint. The result is confirmed with ClickPesa's query API.
    const r = await verifyPayment(orderRef);
    outcome = r.status;
  } catch (e) {
    outcome = `VERIFY_ERROR:${e.code || e.message}`;
    await logWebhook(payload, verified, outcome);
    throw e; // non-2xx so ClickPesa can retry; the reconcile job also picks it up
  }
  await logWebhook(payload, verified, outcome);
  return { ok: true };
}

async function logWebhook(payload, verified, outcome) {
  try {
    await query(`INSERT INTO webhook_events (event, order_ref, verified, outcome) VALUES ($1,$2,$3,$4)`, [
      String((payload && payload.event) || '').slice(0, 40),
      String((payload && payload.data && payload.data.orderReference) || '').slice(0, 40),
      verified,
      String(outcome).slice(0, 120),
    ]);
  } catch (e) {
    logger.error('webhook log failed', e);
  }
}

// Scheduled: confirm anything still unfinished (missed webhooks, closed browser tabs...).
async function reconcilePending() {
  const { rows } = await query(
    `SELECT transaction_id, created_at FROM payments
      WHERE payment_status IN ('PENDING','PROCESSING') AND created_at < now() - interval '45 seconds'
      ORDER BY created_at ASC LIMIT 50`
  );
  for (const p of rows) {
    try {
      const r = await verifyPayment(p.transaction_id);
      const age = Date.now() - new Date(p.created_at).getTime();
      if (!['SUCCESS', 'FAILED'].includes(r.status) && age > 24 * 3600 * 1000) {
        await query(`UPDATE payments SET payment_status='FAILED', failure_message='Muda wa malipo umeisha' WHERE transaction_id=$1 AND payment_status<>'SUCCESS'`, [p.transaction_id]);
      }
    } catch (e) {
      if (e.code === 'CLICKPESA_NOT_CONFIGURED') return;
      logger.warn('reconcile failed', { ref: p.transaction_id, error: e.message });
    }
  }
}

module.exports = { initiatePayment, verifyPayment, handleWebhook, reconcilePending, applyProviderResult, mapProviderStatus };
