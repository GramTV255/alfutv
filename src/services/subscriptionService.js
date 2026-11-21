'use strict';
const { query, tx } = require('../database/pool');
const logger = require('../utils/logger');

// Called inside the payment-confirmation transaction.
// Policy: buying while a subscription is still running EXTENDS it (new period starts when the old one ends).
async function activateSubscription(client, { userId, packageId, paymentId = null, durationDays = null, grantedBy = null, replace = false }) {
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
  const pkg = (await client.query('SELECT duration_days FROM packages WHERE id=$1', [packageId])).rows[0];
  if (!pkg) throw new Error('Package not found');

  const cur = (
    await client.query(
      `SELECT id, expires_at FROM subscriptions WHERE user_id=$1 AND status='ACTIVE' AND expires_at > now() LIMIT 1`,
      [userId]
    )
  ).rows[0];

  await client.query(`UPDATE subscriptions SET status='SUPERSEDED' WHERE user_id=$1 AND status='ACTIVE'`, [userId]);

  const startsAt = cur && !replace ? cur.expires_at : new Date(); // replace: the new package starts now and the old one is ended
  const days = durationDays || pkg.duration_days;
  const { rows } = await client.query(
    `INSERT INTO subscriptions (user_id, package_id, payment_id, granted_by, status, starts_at, expires_at)
     VALUES ($1,$2,$3,$6,'ACTIVE',$4, $4::timestamptz + ($5 || ' days')::interval)
     RETURNING id, starts_at, expires_at`,
    [userId, packageId, paymentId, startsAt, String(days), grantedBy]
  );
  const sub = rows[0];

  // Activate the user's live key (create one if the user had deleted it).
  const upd = await client.query(
    `UPDATE api_keys SET status='ACTIVE', expires_at=$2 WHERE user_id=$1 AND status <> 'REVOKED'`,
    [userId, sub.expires_at]
  );
  return { subscription: sub, keyActivated: upd.rowCount > 0 };
}

// Admin ends a user's running subscription immediately; the key becomes INACTIVE.
async function revokeSubscription(client, userId) {
  const r = await client.query(`UPDATE subscriptions SET status='EXPIRED', expires_at=LEAST(expires_at, now()) WHERE user_id=$1 AND status='ACTIVE'`, [userId]);
  await client.query(`UPDATE api_keys SET status='INACTIVE' WHERE user_id=$1 AND status='ACTIVE'`, [userId]);
  return r.rowCount;
}

// Scheduled safety net. Request-time checks never depend on this having run.
async function expireDueSubscriptions() {
  return tx(async (c) => {
    const exp = await c.query(
      `UPDATE subscriptions SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at <= now() RETURNING user_id`
    );
    const off = await c.query(
      `UPDATE api_keys k SET status='INACTIVE'
        WHERE k.status='ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=k.user_id AND s.status='ACTIVE' AND s.expires_at > now())`
    );
    if (exp.rowCount || off.rowCount) logger.info('Subscriptions expired', { subscriptions: exp.rowCount, keysDeactivated: off.rowCount });
    return { subscriptions: exp.rowCount, keys: off.rowCount };
  });
}

// What the dashboard shows. EXPIRED is derived from time, not just from the status column.
async function getSubscriptionView(userId) {
  const { rows } = await query(
    `SELECT s.id, s.status, s.starts_at, s.expires_at, p.name AS package_name, p.price AS package_price
       FROM subscriptions s JOIN packages p ON p.id = s.package_id
      WHERE s.user_id=$1 AND s.status IN ('ACTIVE','EXPIRED')
      ORDER BY (s.status='ACTIVE') DESC, s.expires_at DESC LIMIT 1`,
    [userId]
  );
  const s = rows[0];
  if (!s) return { status: 'NONE' };
  const expired = s.status === 'EXPIRED' || new Date(s.expires_at) <= new Date();
  return {
    status: expired ? 'EXPIRED' : 'ACTIVE',
    package_name: s.package_name,
    package_price: s.package_price,
    starts_at: s.starts_at,
    expires_at: s.expires_at,
    remaining_seconds: expired ? 0 : Math.max(0, Math.floor((new Date(s.expires_at) - Date.now()) / 1000)),
  };
}

module.exports = { revokeSubscription, activateSubscription, expireDueSubscriptions, getSubscriptionView };
