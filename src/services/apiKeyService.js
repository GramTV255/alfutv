'use strict';
const { query, tx } = require('../database/pool');
const { generateApiKey, hashApiKey } = require('../utils/crypto');
const { HttpError } = require('../utils/errors');

// New keys always begin INACTIVE (until a verified payment activates a subscription).
async function createKeyForUser(client, userId, { active = false, expiresAt = null } = {}) {
  const k = generateApiKey();
  const { rows } = await client.query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, status, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, key_prefix, status, created_at`,
    [userId, k.keyHash, k.keyPrefix, active ? 'ACTIVE' : 'INACTIVE', expiresAt]
  );
  return { apiKey: k.apiKey, ...rows[0] };
}

async function getLiveKey(userId) {
  const { rows } = await query(
    `SELECT id, key_prefix, status, created_at, expires_at FROM api_keys
     WHERE user_id=$1 AND status <> 'REVOKED' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// Replace the user's key. The full value is returned ONCE; only its hash is stored.
async function regenerateKey(userId) {
  return tx(async (c) => {
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    await c.query(`UPDATE api_keys SET status='REVOKED', revoked_at=now() WHERE user_id=$1 AND status <> 'REVOKED'`, [userId]);
    const { rows } = await c.query(
      `SELECT expires_at FROM subscriptions WHERE user_id=$1 AND status='ACTIVE' AND expires_at > now() LIMIT 1`,
      [userId]
    );
    const sub = rows[0];
    return createKeyForUser(c, userId, { active: !!sub, expiresAt: sub ? sub.expires_at : null });
  });
}

// Delete (revoke) the key. A revoked key never accepts requests again.
async function revokeKey(userId) {
  const { rowCount } = await query(
    `UPDATE api_keys SET status='REVOKED', revoked_at=now() WHERE user_id=$1 AND status <> 'REVOKED'`,
    [userId]
  );
  if (!rowCount) throw new HttpError(404, 'Huna API Key inayotumika');
  return true;
}

// Looks up a presented key (by keyed hash) together with the owner and current subscription.
async function findByPlainKey(plain) {
  if (typeof plain !== 'string' || plain.length < 20 || plain.length > 200) return null;
  const { rows } = await query(
    `SELECT k.id AS key_id, k.user_id, k.status AS key_status, k.expires_at AS key_expires_at,
            u.account_status, u.role,
            s.id AS sub_id, s.status AS sub_status, s.expires_at AS sub_expires_at
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       LEFT JOIN LATERAL (
         SELECT id, status, expires_at FROM subscriptions
          WHERE user_id = k.user_id AND status = 'ACTIVE' ORDER BY expires_at DESC LIMIT 1
       ) s ON TRUE
      WHERE k.key_hash = $1`,
    [hashApiKey(plain)]
  );
  return rows[0] || null;
}

module.exports = { createKeyForUser, getLiveKey, regenerateKey, revokeKey, findByPlainKey };
