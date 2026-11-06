'use strict';
const { query } = require('../database/pool');

// Windows are computed in the East Africa timezone so "leo" matches what admins see on the wall clock.
const TZ = 'Africa/Dar_es_Salaam';
const RANGES = {
  today: `date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`,
  week: `date_trunc('week', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`,
  month: `date_trunc('month', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`,
};

async function overview() {
  const one = async (sql) => (await query(sql)).rows[0];
  // All queries run at the same time (one round-trip of waiting instead of ~10 in a row).
  const [users, keys, subs, pay, periodRows, daily] = await Promise.all([
    one(`SELECT count(*) FILTER (WHERE role='USER') AS total,
      count(*) FILTER (WHERE role='USER' AND account_status='ACTIVE') AS active,
      count(*) FILTER (WHERE role='USER' AND account_status='SUSPENDED') AS suspended FROM users`),
    one(`SELECT count(*) FILTER (WHERE status='ACTIVE') AS active, count(*) FILTER (WHERE status='INACTIVE') AS inactive FROM api_keys`),
    one(`SELECT count(*) FILTER (WHERE status='ACTIVE' AND expires_at > now()) AS active,
      count(*) FILTER (WHERE status='EXPIRED' OR (status='ACTIVE' AND expires_at <= now())) AS expired FROM subscriptions`),
    one(`SELECT coalesce(sum(amount) FILTER (WHERE payment_status='SUCCESS'),0) AS revenue,
      count(*) FILTER (WHERE payment_status='SUCCESS') AS success,
      count(*) FILTER (WHERE payment_status IN ('PENDING','PROCESSING')) AS pending,
      count(*) FILTER (WHERE payment_status='FAILED') AS failed FROM payments`),
    Promise.all(Object.entries(RANGES).map(async ([name, start]) => [name, await one(`SELECT
        (SELECT count(*) FROM users WHERE role='USER' AND created_at >= ${start}) AS new_users,
        coalesce((SELECT sum(amount) FROM payments WHERE payment_status='SUCCESS' AND confirmed_at >= ${start}),0) AS revenue,
        (SELECT count(*) FROM payments WHERE payment_status='SUCCESS' AND confirmed_at >= ${start}) AS success,
        (SELECT count(*) FROM payments WHERE payment_status IN ('PENDING','PROCESSING') AND created_at >= ${start}) AS pending,
        (SELECT count(*) FROM payments WHERE payment_status='FAILED' AND created_at >= ${start}) AS failed,
        (SELECT count(*) FROM api_usage_logs WHERE created_at >= ${start}) AS api_requests`)])),
    query(`SELECT to_char(d::date,'DD Mon') AS day, coalesce(sum(p.amount),0) AS revenue
        FROM generate_series((now() AT TIME ZONE '${TZ}')::date - 13, (now() AT TIME ZONE '${TZ}')::date, interval '1 day') d
        LEFT JOIN payments p ON p.payment_status='SUCCESS' AND (p.confirmed_at AT TIME ZONE '${TZ}')::date = d::date
        GROUP BY d ORDER BY d`).then((r) => r.rows),
  ]);
  return { users, keys, subscriptions: subs, payments: pay, periods: Object.fromEntries(periodRows), daily };
}

async function userUsage(userId) {
  const [t, r] = await Promise.all([
    query(`SELECT count(*) AS total, count(*) FILTER (WHERE response_status BETWEEN 200 AND 299) AS success,
        count(*) FILTER (WHERE response_status >= 400) AS failed FROM api_usage_logs WHERE user_id=$1`, [userId]),
    query(`SELECT endpoint, response_status, created_at FROM api_usage_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`, [userId]),
  ]);
  return { ...t.rows[0], recent: r.rows };
}

module.exports = { overview, userUsage };
